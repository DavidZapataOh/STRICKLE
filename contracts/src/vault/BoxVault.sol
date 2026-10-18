// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {BoxLedger, IERC20Minimal} from "./BoxLedger.sol";

interface IERC4626Minimal {
    function asset() external view returns (address);
    function deposit(uint256 assets, address receiver) external returns (uint256 shares);
    function redeem(uint256 shares, address receiver, address from) external returns (uint256 assets);
    function previewDeposit(uint256 assets) external view returns (uint256);
    function previewRedeem(uint256 shares) external view returns (uint256);
}

interface IPriceFeed {
    function decimals() external view returns (uint8);
    function latestRoundData() external view returns (uint80, int256, uint256, uint256, uint80);
}

/// @notice One vault per user. On top of the ledger it gives one agent a narrow role: allocate what arrived,
/// pay approved recipients within a rolling cap and above each box's floor, propose larger payments for the
/// owner to approve, and move a limited share of a box into approved yield vaults and back. The owner can
/// pause, replace or remove the agent in one transaction.
contract BoxVault is BoxLedger {
    uint64 public constant PROPOSAL_LIFETIME = 7 days;
    uint16 public constant MAX_SWAP_SLIPPAGE_BPS = 100;
    uint16 public constant FEED_LAG_BPS = 50;
    /// @dev `execute` of Circle's Adapter, the only function a swap may call.
    bytes4 public constant ADAPTER_EXECUTE = 0xaa3e079c;
    /// @dev Present on a vault that can put a box to work through the adapter; an older implementation has no such function.
    uint8 public constant EARN_VERSION = 1;

    struct Proposal {
        address to;
        uint8 asset;
        uint8 box;
        uint128 amount;
        uint64 expiresAt;
        bytes32 memo;
        bool open;
    }

    error NotAgent();
    error AgentIsPaused();
    error RecipientNotApproved();
    error CapExceeded();
    error BelowFloor();
    error NoSuchProposal();
    error ProposalExpired();
    error VaultNotApproved();
    error VaultAssetMismatch();
    error InvestLimit();
    error InsufficientShares();
    error InvalidBps();
    error SwapAdapterNotApproved();
    error SwapAdapterAlreadySet();
    error WrongSelector();
    error BelowOracleBound();
    error StaleFeed();
    error AdapterShort();
    error AdapterOverspent();
    error BadFeed();

    event AgentSet(address indexed agent, uint256 cap, uint32 window);
    event AgentPausedSet(bool paused);
    event AgentPaid(uint8 indexed asset, uint8 indexed box, address indexed to, uint256 amount, uint256 newBalance);
    event ProposalCreated(
        uint256 indexed id,
        uint8 indexed asset,
        uint8 indexed box,
        address to,
        uint256 amount,
        bytes32 memo,
        uint64 expiresAt
    );
    event ProposalApproved(uint256 indexed id);
    event ProposalRejected(uint256 indexed id);
    event VaultApprovalSet(address indexed vault, uint64 effectiveAt);
    event VaultRevoked(address indexed vault);
    event MaxInvestSet(uint8 indexed box, uint16 bps);
    event Swept(uint8 indexed asset, uint8 indexed box, address indexed vault, uint256 assets, uint256 shares);
    event Redeemed(uint8 indexed asset, uint8 indexed box, address indexed vault, uint256 shares, uint256 assets);
    event SwapAdapterSet(address indexed adapter, uint64 effectiveAt);
    event SwapAdapterRevoked(address indexed adapter);
    event SwapSlippageSet(uint16 bps);
    event SwapCapSet(uint128 cap, uint32 window);
    event Swapped(uint8 indexed box, uint8 indexed assetIn, uint256 amountIn, uint256 received);
    event Earned(
        uint8 indexed asset, uint8 indexed box, address indexed vault, bool deposit, uint256 amountIn, uint256 received
    );

    address public agent;
    bool public agentPaused;
    uint128 public agentCap;
    uint32 public agentWindow;
    uint64 public windowStart;
    uint128 public windowSpent;

    mapping(address vault => uint64) public vaultApprovedFrom;
    mapping(uint8 box => uint16) private investOverride;
    mapping(uint8 box => bool) private investOverridden;
    mapping(uint8 asset => mapping(uint8 box => uint256)) public invested;
    mapping(address vault => mapping(uint8 box => uint256)) public sharesOf;
    mapping(uint256 id => Proposal) public proposals;
    uint256 public nextProposalId;

    address public swapAdapter;
    uint64 public swapAdapterFrom;
    uint128 public swapCap;
    uint32 public swapWindow;
    uint64 public swapWindowStart;
    uint128 public swapWindowSpent;
    uint16 private swapSlippage;

    IPriceFeed public immutable USDC_FEED;
    IPriceFeed public immutable EURC_FEED;
    uint32 public immutable MAX_FEED_AGE;

    constructor(address usdc, address eurc, address usdcFeed, address eurcFeed, uint32 maxFeedAge)
        BoxLedger(usdc, eurc)
    {
        if (IPriceFeed(usdcFeed).decimals() != 8 || IPriceFeed(eurcFeed).decimals() != 8) {
            revert BadFeed();
        }
        USDC_FEED = IPriceFeed(usdcFeed);
        EURC_FEED = IPriceFeed(eurcFeed);
        MAX_FEED_AGE = maxFeedAge;
    }

    modifier onlyAgent() {
        _requireAgent();
        _;
    }

    // ---------------------------------------------------------------- owner: the agent's role

    function setAgent(address agent_, uint128 cap, uint32 window) external onlyOwner {
        agent = agent_;
        agentPaused = false;
        agentCap = cap;
        agentWindow = window;
        windowStart = 0;
        windowSpent = 0;
        emit AgentSet(agent_, cap, window);
    }

    function pauseAgent() external onlyOwner {
        agentPaused = true;
        emit AgentPausedSet(true);
    }

    function resumeAgent() external onlyOwner {
        agentPaused = false;
        emit AgentPausedSet(false);
    }

    function revokeAgent() external onlyOwner {
        agent = address(0);
        agentPaused = false;
        emit AgentSet(address(0), 0, 0);
    }

    function approveVault(address vault) external onlyOwner {
        if (vaultApprovedFrom[vault] != 0) return;
        uint64 effectiveAt = uint64(block.timestamp) + MIN_LOOSEN_DELAY;
        vaultApprovedFrom[vault] = effectiveAt;
        emit VaultApprovalSet(vault, effectiveAt);
    }

    function revokeVault(address vault) external onlyOwner {
        delete vaultApprovedFrom[vault];
        emit VaultRevoked(vault);
    }

    function setMaxInvestBps(uint8 box, uint16 bps) external onlyOwner {
        _checkBox(box);
        if (bps > 10_000) revert InvalidBps();
        investOverride[box] = bps;
        investOverridden[box] = true;
        emit MaxInvestSet(box, bps);
    }

    function maxInvestBps(uint8 box) public view returns (uint16) {
        if (investOverridden[box]) return investOverride[box];
        if (box == 1) return 5_000;
        if (box == 2 || box == 4) return 0;
        return 10_000;
    }

    function approveSwapAdapter(address adapter) external onlyOwner {
        if (swapAdapter != address(0)) revert SwapAdapterAlreadySet();
        swapAdapter = adapter;
        uint64 effectiveAt = uint64(block.timestamp) + MIN_LOOSEN_DELAY;
        swapAdapterFrom = effectiveAt;
        emit SwapAdapterSet(adapter, effectiveAt);
    }

    function revokeSwapAdapter() external onlyOwner {
        address adapter = swapAdapter;
        delete swapAdapter;
        delete swapAdapterFrom;
        emit SwapAdapterRevoked(adapter);
    }

    function setSwapSlippageBps(uint16 bps) external onlyOwner {
        _checkBps(bps);
        swapSlippage = bps;
        emit SwapSlippageSet(bps);
    }

    function setSwapCap(uint128 cap, uint32 window) external onlyOwner {
        swapCap = cap;
        swapWindow = window;
        swapWindowStart = 0;
        swapWindowSpent = 0;
        emit SwapCapSet(cap, window);
    }

    /// @notice The slippage bound for every move through the adapter, swaps and Earn alike.
    function swapSlippageBps() public view returns (uint16) {
        uint16 set = swapSlippage;
        return set == 0 ? MAX_SWAP_SLIPPAGE_BPS : set;
    }

    function minSwapOutput(uint8 assetIn, uint256 amountIn) public view returns (uint256) {
        (uint256 priceIn, uint256 priceOut) =
            assetIn == 1 ? (_price(USDC_FEED), _price(EURC_FEED)) : (_price(EURC_FEED), _price(USDC_FEED));
        uint256 denominator = priceOut * 10_000;
        return (amountIn * priceIn * (10_000 - swapSlippageBps() - FEED_LAG_BPS) + denominator - 1) / denominator;
    }

    function approveProposal(uint256 id) external onlyOwner nonReentrant {
        Proposal memory proposal = proposals[id];
        if (!proposal.open) revert NoSuchProposal();
        if (block.timestamp > proposal.expiresAt) revert ProposalExpired();
        delete proposals[id];
        emit ProposalApproved(id);
        _ownerPay(proposal.asset, proposal.box, proposal.amount, proposal.to, true);
    }

    function rejectProposal(uint256 id) external onlyOwner {
        if (!proposals[id].open) revert NoSuchProposal();
        delete proposals[id];
        emit ProposalRejected(id);
    }

    // ---------------------------------------------------------------- agent

    function split(uint8 asset, uint8[] calldata boxes, uint256[] calldata amounts) external onlyAgent {
        _allocate(asset, boxes, amounts);
    }

    function payAllowlisted(uint8 asset, uint8 box, address to, uint256 amount) external onlyAgent nonReentrant {
        _checkBox(box);
        if (amount == 0) revert ZeroAmount();
        if (amount > boxBalance[asset][box]) revert InsufficientBox();
        if (!isApproved(box, to)) revert RecipientNotApproved();
        if (boxBalance[asset][box] - amount < rules[box].floor) revert BelowFloor();
        _spendCap(amount);
        _debit(asset, box, amount);
        _send(asset, to, amount);
        emit AgentPaid(asset, box, to, amount, boxBalance[asset][box]);
    }

    function proposeLargePayment(uint8 asset, uint8 box, address to, uint256 amount, bytes32 memo)
        external
        onlyAgent
        returns (uint256 id)
    {
        _checkBox(box);
        _token(asset);
        if (amount == 0) revert ZeroAmount();
        id = nextProposalId++;
        uint64 expiresAt = uint64(block.timestamp) + PROPOSAL_LIFETIME;
        proposals[id] = Proposal({
            to: to, asset: asset, box: box, amount: uint128(amount), expiresAt: expiresAt, memo: memo, open: true
        });
        emit ProposalCreated(id, asset, box, to, amount, memo, expiresAt);
    }

    function sweepToVault(uint8 asset, uint8 box, address vault, uint256 assets) external onlyAgent nonReentrant {
        _checkBox(box);
        IERC20Minimal token = _token(asset);
        _requireInvestable(asset, box, vault, assets);

        uint256 before = token.balanceOf(address(this));
        _approve(token, vault, assets);
        uint256 shares = IERC4626Minimal(vault).deposit(assets, address(this));
        _approve(token, vault, 0);
        if (before - token.balanceOf(address(this)) != assets) revert TransferFailed();

        _debit(asset, box, assets);
        invested[asset][box] += assets;
        sharesOf[vault][box] += shares;
        emit Swept(asset, box, vault, assets, shares);
    }

    /// @notice Brings value back from a yield vault into the same box; the owner can always do this too, and no
    /// approval is needed, so revoking a vault never traps what is already inside.
    function redeem(uint8 asset, uint8 box, address vault, uint256 shares) external nonReentrant {
        if (msg.sender != owner) _requireAgent();
        _checkBox(box);
        IERC20Minimal token = _token(asset);
        uint256 owned = sharesOf[vault][box];
        if (shares == 0) revert ZeroAmount();
        if (shares > owned) revert InsufficientShares();

        uint256 before = token.balanceOf(address(this));
        IERC4626Minimal(vault).redeem(shares, address(this), address(this));
        uint256 received = token.balanceOf(address(this)) - before;
        _settleRedeem(asset, box, vault, owned, shares, received);
        emit Redeemed(asset, box, vault, shares, received);
    }

    /// @notice Puts a box to work in an approved yield vault through the one approved Circle adapter. The output
    /// bound comes from the yield vault's own share price, never from the caller, and the ledger moves only by
    /// what this vault's own balances prove.
    function earnIn(uint8 asset, uint8 box, address vault, uint256 amount, uint256 minOut, bytes calldata data)
        external
        onlyAgent
        nonReentrant
    {
        _earnGuard(box, data);
        _requireInvestable(asset, box, vault, amount);
        if (minOut < _earnFloor(IERC4626Minimal(vault).previewDeposit(amount))) revert BelowOracleBound();
        _earnIn(asset, box, vault, amount, minOut, data);
    }

    /// @notice Takes a box back out of a yield vault the same way. The owner can also do this, with no vault
    /// approval needed, so the owner never depends on the agent to get money out.
    function earnOut(uint8 asset, uint8 box, address vault, uint256 shares, uint256 minOut, bytes calldata data)
        external
        nonReentrant
    {
        if (msg.sender != owner) _requireAgent();
        _earnGuard(box, data);
        if (shares == 0) revert ZeroAmount();
        if (IERC4626Minimal(vault).asset() != address(_token(asset))) revert VaultAssetMismatch();
        if (shares > sharesOf[vault][box]) revert InsufficientShares();
        if (minOut < _earnFloor(IERC4626Minimal(vault).previewRedeem(shares))) revert BelowOracleBound();
        _earnOut(asset, box, vault, shares, minOut, data);
    }

    /// @notice Converts part of a box to the other asset through the one approved adapter. The price floor comes
    /// from the feeds, never from the caller, and the ledger moves only by what this vault's own balances prove.
    function swapBox(uint8 box, uint8 assetIn, uint256 amountIn, uint256 minOut, bytes calldata data)
        external
        onlyAgent
        nonReentrant
    {
        _checkBox(box);
        if (assetIn != 1 && assetIn != 2) revert UnknownAsset();
        if (amountIn == 0) revert ZeroAmount();
        if (amountIn > boxBalance[assetIn][box]) revert InsufficientBox();
        _approvedAdapter();
        if (data.length < 4 || bytes4(data[:4]) != ADAPTER_EXECUTE) revert WrongSelector();
        if (minOut < minSwapOutput(assetIn, amountIn)) revert BelowOracleBound();
        _swapSpend(amountIn);

        (uint256 spent, uint256 received) = _runSwap(assetIn, amountIn, data);
        if (spent > amountIn) revert AdapterOverspent();
        if (received < minOut) revert AdapterShort();

        uint8 assetOut = assetIn == 1 ? 2 : 1;
        _debit(assetIn, box, spent);
        if (boxBalance[assetIn][box] < rules[box].floor) revert BelowFloor();
        boxBalance[assetOut][box] += received;
        held[assetOut] += received;
        emit Swapped(box, assetIn, spent, received);
    }

    // ---------------------------------------------------------------- internals

    function _requireAgent() private view {
        if (msg.sender != agent || agent == address(0)) revert NotAgent();
        if (agentPaused) revert AgentIsPaused();
    }

    function _roll(uint256 amount, uint256 cap, uint32 window, uint64 start, uint128 spent)
        private
        view
        returns (uint64, uint128)
    {
        if (cap == 0 || window == 0) revert CapExceeded();
        if (block.timestamp >= uint256(start) + window) {
            start = uint64(block.timestamp);
            spent = 0;
        }
        if (spent + amount > cap) revert CapExceeded();
        return (start, spent + uint128(amount));
    }

    function _spendCap(uint256 amount) private {
        (windowStart, windowSpent) = _roll(amount, agentCap, agentWindow, windowStart, windowSpent);
    }

    function _checkBps(uint16 bps) private pure {
        if (bps < 10 || bps > MAX_SWAP_SLIPPAGE_BPS) revert InvalidBps();
    }

    function _requireInvestable(uint8 asset, uint8 box, address vault, uint256 assets) private view {
        uint64 from = vaultApprovedFrom[vault];
        if (from == 0 || block.timestamp < from) revert VaultNotApproved();
        if (IERC4626Minimal(vault).asset() != address(_token(asset))) revert VaultAssetMismatch();
        if (assets == 0) revert ZeroAmount();
        if (assets > boxBalance[asset][box]) revert InsufficientBox();
        uint256 base = boxBalance[asset][box] + invested[asset][box];
        if ((invested[asset][box] + assets) * 10_000 > uint256(maxInvestBps(box)) * base) revert InvestLimit();
    }

    function _settleRedeem(uint8 asset, uint8 box, address vault, uint256 owned, uint256 spent, uint256 received)
        private
    {
        uint256 principal = spent == owned ? invested[asset][box] : (invested[asset][box] * spent) / owned;
        sharesOf[vault][box] = owned - spent;
        invested[asset][box] -= principal;
        boxBalance[asset][box] += received;
        held[asset] += received;
    }

    function _earnGuard(uint8 box, bytes calldata data) private view {
        _checkBox(box);
        _approvedAdapter();
        if (data.length < 4 || bytes4(data[:4]) != ADAPTER_EXECUTE) revert WrongSelector();
    }

    function _earnFloor(uint256 expected) private view returns (uint256) {
        return (expected * (10_000 - swapSlippageBps()) + 9_999) / 10_000;
    }

    function _adapterCall(IERC20Minimal token, uint256 amount, bytes calldata data) private {
        address adapter = swapAdapter;
        _approve(token, adapter, amount);
        (bool ok,) = adapter.call(data);
        _approve(token, adapter, 0);
        if (!ok) revert TransferFailed();
    }

    /// @dev What the adapter really took and gave, measured on this vault's own balances.
    function _earnIn(uint8 asset, uint8 box, address vault, uint256 amount, uint256 minOut, bytes calldata data)
        private
    {
        uint256 tokenBefore = _token(asset).balanceOf(address(this));
        uint256 sharesBefore = IERC20Minimal(vault).balanceOf(address(this));
        _adapterCall(_token(asset), amount, data);
        uint256 spent = tokenBefore - _token(asset).balanceOf(address(this));
        uint256 shares = IERC20Minimal(vault).balanceOf(address(this)) - sharesBefore;
        if (spent > amount) revert AdapterOverspent();
        if (shares < minOut || shares == 0) revert AdapterShort();
        _creditEarn(asset, box, vault, spent, shares);
    }

    function _creditEarn(uint8 asset, uint8 box, address vault, uint256 spent, uint256 shares) private {
        _debit(asset, box, spent);
        if (boxBalance[asset][box] < rules[box].floor) revert BelowFloor();
        invested[asset][box] += spent;
        sharesOf[vault][box] += shares;
        emit Earned(asset, box, vault, true, spent, shares);
    }

    function _earnOut(uint8 asset, uint8 box, address vault, uint256 shares, uint256 minOut, bytes calldata data)
        private
    {
        uint256 tokenBefore = _token(asset).balanceOf(address(this));
        uint256 sharesBefore = IERC20Minimal(vault).balanceOf(address(this));
        _adapterCall(IERC20Minimal(vault), shares, data);
        uint256 spent = sharesBefore - IERC20Minimal(vault).balanceOf(address(this));
        uint256 received = _token(asset).balanceOf(address(this)) - tokenBefore;
        if (spent > shares) revert AdapterOverspent();
        if (received < minOut) revert AdapterShort();
        _settleRedeem(asset, box, vault, sharesOf[vault][box], spent, received);
        emit Earned(asset, box, vault, false, spent, received);
    }

    function _approvedAdapter() private view returns (address adapter) {
        adapter = swapAdapter;
        uint64 from = swapAdapterFrom;
        if (adapter == address(0) || from == 0 || block.timestamp < from) revert SwapAdapterNotApproved();
    }

    /// @dev What the adapter really took and gave, measured on this vault's own balances.
    function _runSwap(uint8 assetIn, uint256 amountIn, bytes calldata data)
        private
        returns (uint256 spent, uint256 received)
    {
        IERC20Minimal tokenIn = _token(assetIn);
        IERC20Minimal tokenOut = _token(assetIn == 1 ? 2 : 1);
        uint256 inBefore = tokenIn.balanceOf(address(this));
        uint256 outBefore = tokenOut.balanceOf(address(this));
        _adapterCall(tokenIn, amountIn, data);
        spent = inBefore - tokenIn.balanceOf(address(this));
        received = tokenOut.balanceOf(address(this)) - outBefore;
    }

    function _swapSpend(uint256 amount) private {
        (swapWindowStart, swapWindowSpent) = _roll(amount, swapCap, swapWindow, swapWindowStart, swapWindowSpent);
    }

    function _price(IPriceFeed feed) private view returns (uint256) {
        (, int256 answer,, uint256 updatedAt,) = feed.latestRoundData();
        if (answer <= 0 || updatedAt > block.timestamp || block.timestamp - updatedAt > MAX_FEED_AGE) {
            revert StaleFeed();
        }
        return uint256(answer);
    }

    function _approve(IERC20Minimal token, address spender, uint256 amount) private {
        (bool ok, bytes memory result) =
            address(token).call(abi.encodeWithSignature("approve(address,uint256)", spender, amount));
        if (!ok || (result.length != 0 && !abi.decode(result, (bool)))) revert TransferFailed();
    }
}
