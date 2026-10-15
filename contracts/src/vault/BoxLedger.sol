// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

interface IERC20Minimal {
    function balanceOf(address account) external view returns (uint256);
    function transfer(address to, uint256 amount) external returns (bool);
}

/// @notice The user's own account split into six boxes. Money never leaves except through the owner's
/// withdrawals, which obey each box's rule: how long a withdrawal waits, which recipients are approved,
/// the floor below which a wait applies and an optional hard lock until a date.
abstract contract BoxLedger {
    uint8 internal constant BOX_COUNT = 6;
    uint32 public constant MIN_LOOSEN_DELAY = 1 days;

    struct Rule {
        uint32 delay;
        bool alwaysDelayed;
        bool restricted;
        uint128 floor;
        uint64 lockedUntil;
    }

    struct Request {
        address to;
        uint8 asset;
        uint8 box;
        uint128 amount;
        uint64 executeAfter;
        bool open;
    }

    struct RuleChange {
        Rule rule;
        uint64 effectiveAt;
        bool open;
    }

    error NotOwner();
    error UnknownBox();
    error UnknownAsset();
    error LengthMismatch();
    error ZeroAmount();
    error InsufficientUnallocated();
    error InsufficientBox();
    error WaitRequired();
    error StillWaiting();
    error NoSuchRequest();
    error HardLocked();
    error NoPendingChange();
    error AlreadyInitialised();
    error TransferFailed();
    error Reentrancy();

    event Allocated(uint8 indexed asset, uint8 indexed box, uint256 amount, uint256 newBalance);
    event Withdrawn(uint8 indexed asset, uint8 indexed box, address indexed to, uint256 amount, uint256 newBalance);
    event WithdrawalRequested(
        uint256 indexed id, uint8 indexed asset, uint8 indexed box, address to, uint256 amount, uint64 executeAfter
    );
    event WithdrawalExecuted(uint256 indexed id);
    event WithdrawalCancelled(uint256 indexed id);
    event RuleSet(uint8 indexed box, Rule rule);
    event RuleChangeProposed(uint8 indexed box, Rule rule, uint64 effectiveAt);
    event RuleChangeCancelled(uint8 indexed box);
    event RecipientApproved(uint8 indexed box, address indexed to, uint64 effectiveAt);
    event RecipientRevoked(uint8 indexed box, address indexed to);
    event OwnershipTransferStarted(address indexed pendingOwner);
    event OwnershipTransferred(address indexed owner);

    IERC20Minimal internal immutable USDC;
    IERC20Minimal internal immutable EURC;

    address public owner;
    address public pendingOwner;
    bool private initialised;
    uint256 private lock = 1;

    mapping(uint8 asset => mapping(uint8 box => uint256)) public boxBalance;
    /// @notice Boxes plus open withdrawal requests: what the vault owes inside its own accounting.
    mapping(uint8 asset => uint256) public held;
    mapping(uint8 box => Rule) public rules;
    mapping(uint8 box => RuleChange) public ruleChanges;
    mapping(uint8 box => mapping(address who => uint64)) public approvedFrom;
    mapping(uint256 id => Request) public requests;
    uint256 public nextRequestId;

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier nonReentrant() {
        if (lock != 1) revert Reentrancy();
        lock = 2;
        _;
        lock = 1;
    }

    constructor(address usdc, address eurc) {
        USDC = IERC20Minimal(usdc);
        EURC = IERC20Minimal(eurc);
        initialised = true;
    }

    function initialize(address owner_) external {
        if (initialised) revert AlreadyInitialised();
        initialised = true;
        lock = 1;
        owner = owner_;
        rules[1] = Rule({delay: 48 hours, alwaysDelayed: true, restricted: false, floor: 0, lockedUntil: 0});
        rules[2] = Rule({delay: 24 hours, alwaysDelayed: false, restricted: true, floor: 0, lockedUntil: 0});
        rules[5] = Rule({delay: 24 hours, alwaysDelayed: true, restricted: false, floor: 0, lockedUntil: 0});
        emit OwnershipTransferred(owner_);
    }

    // ---------------------------------------------------------------- views

    function unallocated(uint8 asset) public view returns (uint256) {
        return _token(asset).balanceOf(address(this)) - held[asset];
    }

    function isApproved(uint8 box, address who) public view returns (bool) {
        uint64 from = approvedFrom[box][who];
        return from != 0 && block.timestamp >= from;
    }

    // ---------------------------------------------------------------- boxes

    function allocate(uint8 asset, uint8[] calldata boxes, uint256[] calldata amounts) external onlyOwner {
        _allocate(asset, boxes, amounts);
    }

    function withdraw(uint8 asset, uint8 box, uint256 amount, address to) external onlyOwner nonReentrant {
        _checkBox(box);
        if (amount == 0) revert ZeroAmount();
        if (amount > boxBalance[asset][box]) revert InsufficientBox();
        Rule memory rule = rules[box];
        if (block.timestamp < rule.lockedUntil) revert HardLocked();
        if (
            rule.alwaysDelayed || (rule.restricted && !isApproved(box, to))
                || boxBalance[asset][box] - amount < rule.floor
        ) {
            revert WaitRequired();
        }
        _debit(asset, box, amount);
        _send(asset, to, amount);
        emit Withdrawn(asset, box, to, amount, boxBalance[asset][box]);
    }

    function requestWithdrawal(uint8 asset, uint8 box, uint256 amount, address to)
        external
        onlyOwner
        returns (uint256 id)
    {
        _checkBox(box);
        if (amount == 0) revert ZeroAmount();
        if (amount > boxBalance[asset][box]) revert InsufficientBox();
        Rule memory rule = rules[box];
        if (block.timestamp < rule.lockedUntil) revert HardLocked();
        _token(asset);
        boxBalance[asset][box] -= amount;
        id = nextRequestId++;
        uint64 executeAfter = uint64(block.timestamp) + rule.delay;
        requests[id] =
            Request({to: to, asset: asset, box: box, amount: uint128(amount), executeAfter: executeAfter, open: true});
        emit WithdrawalRequested(id, asset, box, to, amount, executeAfter);
    }

    function executeWithdrawal(uint256 id) external onlyOwner nonReentrant {
        Request memory request = requests[id];
        if (!request.open) revert NoSuchRequest();
        if (block.timestamp < request.executeAfter) revert StillWaiting();
        if (block.timestamp < rules[request.box].lockedUntil) revert HardLocked();
        delete requests[id];
        held[request.asset] -= request.amount;
        _send(request.asset, request.to, request.amount);
        emit WithdrawalExecuted(id);
        emit Withdrawn(request.asset, request.box, request.to, request.amount, boxBalance[request.asset][request.box]);
    }

    function cancelWithdrawal(uint256 id) external onlyOwner {
        Request memory request = requests[id];
        if (!request.open) revert NoSuchRequest();
        delete requests[id];
        boxBalance[request.asset][request.box] += request.amount;
        emit WithdrawalCancelled(id);
    }

    // ---------------------------------------------------------------- rules

    function setRule(uint8 box, Rule calldata rule) external onlyOwner {
        _checkBox(box);
        Rule memory current = rules[box];
        if (_isTighter(current, rule)) {
            rules[box] = rule;
            delete ruleChanges[box];
            emit RuleSet(box, rule);
        } else {
            uint64 effectiveAt = uint64(block.timestamp) + _loosenDelay(current);
            ruleChanges[box] = RuleChange({rule: rule, effectiveAt: effectiveAt, open: true});
            emit RuleChangeProposed(box, rule, effectiveAt);
        }
    }

    function applyRuleChange(uint8 box) external onlyOwner {
        RuleChange memory change = ruleChanges[box];
        if (!change.open) revert NoPendingChange();
        if (block.timestamp < change.effectiveAt) revert StillWaiting();
        delete ruleChanges[box];
        rules[box] = change.rule;
        emit RuleSet(box, change.rule);
    }

    function cancelRuleChange(uint8 box) external onlyOwner {
        if (!ruleChanges[box].open) revert NoPendingChange();
        delete ruleChanges[box];
        emit RuleChangeCancelled(box);
    }

    function approveRecipient(uint8 box, address who) external onlyOwner {
        _checkBox(box);
        if (approvedFrom[box][who] != 0) return;
        uint64 effectiveAt = uint64(block.timestamp) + _loosenDelay(rules[box]);
        approvedFrom[box][who] = effectiveAt;
        emit RecipientApproved(box, who, effectiveAt);
    }

    function revokeRecipient(uint8 box, address who) external onlyOwner {
        delete approvedFrom[box][who];
        emit RecipientRevoked(box, who);
    }

    // ---------------------------------------------------------------- ownership

    function transferOwnership(address next) external onlyOwner {
        pendingOwner = next;
        emit OwnershipTransferStarted(next);
    }

    function acceptOwnership() external {
        if (msg.sender != pendingOwner) revert NotOwner();
        owner = msg.sender;
        pendingOwner = address(0);
        emit OwnershipTransferred(msg.sender);
    }

    // ---------------------------------------------------------------- internals

    function _allocate(uint8 asset, uint8[] calldata boxes, uint256[] calldata amounts) internal {
        if (boxes.length != amounts.length) revert LengthMismatch();
        uint256 total;
        for (uint256 i = 0; i < boxes.length; ++i) {
            _checkBox(boxes[i]);
            total += amounts[i];
        }
        if (total > unallocated(asset)) revert InsufficientUnallocated();
        for (uint256 i = 0; i < boxes.length; ++i) {
            if (amounts[i] == 0) continue;
            boxBalance[asset][boxes[i]] += amounts[i];
            held[asset] += amounts[i];
            emit Allocated(asset, boxes[i], amounts[i], boxBalance[asset][boxes[i]]);
        }
    }

    function _debit(uint8 asset, uint8 box, uint256 amount) internal {
        boxBalance[asset][box] -= amount;
        held[asset] -= amount;
    }

    function _send(uint8 asset, address to, uint256 amount) internal {
        (bool ok, bytes memory result) =
            address(_token(asset)).call(abi.encodeCall(IERC20Minimal.transfer, (to, amount)));
        if (!ok || (result.length != 0 && !abi.decode(result, (bool)))) revert TransferFailed();
    }

    function _token(uint8 asset) internal view returns (IERC20Minimal) {
        if (asset == 1) return USDC;
        if (asset == 2) return EURC;
        revert UnknownAsset();
    }

    function _checkBox(uint8 box) internal pure {
        if (box == 0 || box > BOX_COUNT) revert UnknownBox();
    }

    function _loosenDelay(Rule memory current) private pure returns (uint64) {
        return current.delay > MIN_LOOSEN_DELAY ? current.delay : MIN_LOOSEN_DELAY;
    }

    function _isTighter(Rule memory current, Rule calldata next) private pure returns (bool) {
        return next.delay >= current.delay && (next.alwaysDelayed || !current.alwaysDelayed)
            && (next.restricted || !current.restricted) && next.floor >= current.floor
            && next.lockedUntil >= current.lockedUntil;
    }
}
