// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

interface IScreening {
    /// @return risk 0 clear, 1 elevated, 2 blocked; `fresh` is false when the address was never screened or its record expired.
    function status(address who) external view returns (uint8 risk, bool fresh);
}

/// @notice Public screening records for the pool's depositors: a risk tier, when it was set and a digest of
/// the off-chain report that justifies it. Screeners write, the owner manages screeners and the freshness window.
contract ScreeningRegistry is IScreening {
    uint256 public constant MAX_BATCH = 200;

    struct Record {
        uint8 risk;
        uint64 screenedAt;
        bytes32 evidence;
    }

    error NotOwner();
    error NotScreener();
    error InvalidRisk();
    error LengthMismatch();
    error BatchTooLarge();

    event RiskSet(address indexed who, uint8 risk, uint64 screenedAt, bytes32 evidence);
    event ScreenerSet(address indexed screener, bool allowed);
    event TtlSet(uint64 ttl);
    event OwnershipTransferStarted(address pendingOwner);
    event OwnershipTransferred(address owner);

    address public owner;
    address public pendingOwner;
    uint64 public ttl;
    mapping(address screener => bool) public isScreener;
    mapping(address who => Record) private records;

    constructor(address owner_, uint64 ttl_) {
        owner = owner_;
        ttl = ttl_;
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyScreener() {
        if (!isScreener[msg.sender]) revert NotScreener();
        _;
    }

    function status(address who) external view returns (uint8 risk, bool fresh) {
        Record memory record = records[who];
        risk = record.risk;
        fresh = record.screenedAt != 0 && block.timestamp - record.screenedAt <= ttl;
    }

    function recordOf(address who) external view returns (uint8 risk, uint64 screenedAt, bytes32 evidence) {
        Record memory record = records[who];
        return (record.risk, record.screenedAt, record.evidence);
    }

    function setRisk(address who, uint8 risk, bytes32 evidence) external onlyScreener {
        _set(who, risk, evidence);
    }

    function setRisks(address[] calldata who, uint8[] calldata risks, bytes32 evidence) external onlyScreener {
        if (who.length != risks.length) revert LengthMismatch();
        if (who.length > MAX_BATCH) revert BatchTooLarge();
        for (uint256 i = 0; i < who.length; ++i) {
            _set(who[i], risks[i], evidence);
        }
    }

    function setScreener(address screener, bool allowed) external onlyOwner {
        isScreener[screener] = allowed;
        emit ScreenerSet(screener, allowed);
    }

    function setTtl(uint64 ttl_) external onlyOwner {
        ttl = ttl_;
        emit TtlSet(ttl_);
    }

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

    function _set(address who, uint8 risk, bytes32 evidence) private {
        if (risk > 2) revert InvalidRisk();
        uint64 now_ = uint64(block.timestamp);
        records[who] = Record(risk, now_, evidence);
        emit RiskSet(who, risk, now_, evidence);
    }
}
