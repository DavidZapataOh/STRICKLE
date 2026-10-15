// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {BoxLedger, IERC20Minimal} from "./BoxLedger.sol";

interface IERC4626Minimal {
    function asset() external view returns (address);
    function deposit(uint256 assets, address receiver) external returns (uint256 shares);
    function redeem(uint256 shares, address receiver, address from) external returns (uint256 assets);
}

/// @notice One vault per user. On top of the ledger it gives one agent a narrow role: allocate what arrived,
/// pay approved recipients within a rolling cap and above each box's floor, propose larger payments for the
/// owner to approve, and move a limited share of a box into approved yield vaults and back. The owner can
/// pause, replace or remove the agent in one transaction.
contract BoxVault is BoxLedger {
    uint64 public constant PROPOSAL_LIFETIME = 7 days;

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

    constructor(address usdc, address eurc) BoxLedger(usdc, eurc) {}

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
        uint64 from = vaultApprovedFrom[vault];
        if (from == 0 || block.timestamp < from) revert VaultNotApproved();
        if (IERC4626Minimal(vault).asset() != address(token)) revert VaultAssetMismatch();
        if (assets == 0) revert ZeroAmount();
        if (assets > boxBalance[asset][box]) revert InsufficientBox();
        uint256 base = boxBalance[asset][box] + invested[asset][box];
        if ((invested[asset][box] + assets) * 10_000 > uint256(maxInvestBps(box)) * base) revert InvestLimit();

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
        uint256 principal = shares == owned ? invested[asset][box] : (invested[asset][box] * shares) / owned;

        uint256 before = token.balanceOf(address(this));
        IERC4626Minimal(vault).redeem(shares, address(this), address(this));
        uint256 received = token.balanceOf(address(this)) - before;

        sharesOf[vault][box] = owned - shares;
        invested[asset][box] -= principal;
        boxBalance[asset][box] += received;
        held[asset] += received;
        emit Redeemed(asset, box, vault, shares, received);
    }

    // ---------------------------------------------------------------- internals

    function _requireAgent() private view {
        if (msg.sender != agent || agent == address(0)) revert NotAgent();
        if (agentPaused) revert AgentIsPaused();
    }

    function _spendCap(uint256 amount) private {
        if (agentCap == 0 || agentWindow == 0) revert CapExceeded();
        if (block.timestamp >= uint256(windowStart) + agentWindow) {
            windowStart = uint64(block.timestamp);
            windowSpent = 0;
        }
        if (windowSpent + amount > agentCap) revert CapExceeded();
        windowSpent += uint128(amount);
    }

    function _approve(IERC20Minimal token, address spender, uint256 amount) private {
        (bool ok, bytes memory result) =
            address(token).call(abi.encodeWithSignature("approve(address,uint256)", spender, amount));
        if (!ok || (result.length != 0 && !abi.decode(result, (bool)))) revert TransferFailed();
    }
}
