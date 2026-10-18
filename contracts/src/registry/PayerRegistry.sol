// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

/// @notice Public list of known payers (payroll platforms, payment rails, DAOs, grant programs) that proof of
/// income treats as an intermediate trust tier. The owner adds and revokes; each entry carries a category and a
/// hash of its published record. A revoked entry keeps its record for audit but never reads as known.
contract PayerRegistry {
    enum Category {
        Payroll,
        PaymentRail,
        Dao,
        Grants
    }

    struct Entry {
        bool active;
        Category category;
        uint64 updatedAt;
        bytes32 metadata;
    }

    error NotOwner();
    error ZeroAddress();
    error AlreadyKnown();
    error NotKnown();

    event PayerAdded(address indexed payer, Category category, bytes32 metadata);
    event PayerRevoked(address indexed payer);
    event OwnershipTransferStarted(address pendingOwner);
    event OwnershipTransferred(address owner);

    address public owner;
    address public pendingOwner;
    mapping(address payer => Entry) private entries;

    constructor(address owner_) {
        owner = owner_;
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    function isKnownPayer(address payer) external view returns (bool) {
        return entries[payer].active;
    }

    function categoryOf(address payer) external view returns (bool known, Category category) {
        Entry storage entry = entries[payer];
        return (entry.active, entry.category);
    }

    function entryOf(address payer)
        external
        view
        returns (bool known, Category category, bytes32 metadata, uint64 updatedAt)
    {
        Entry storage entry = entries[payer];
        return (entry.active, entry.category, entry.metadata, entry.updatedAt);
    }

    function add(address payer, Category category, bytes32 metadata) external onlyOwner {
        if (payer == address(0)) revert ZeroAddress();
        if (entries[payer].active) revert AlreadyKnown();
        entries[payer] = Entry(true, category, uint64(block.timestamp), metadata);
        emit PayerAdded(payer, category, metadata);
    }

    function revoke(address payer) external onlyOwner {
        Entry storage entry = entries[payer];
        if (!entry.active) revert NotKnown();
        entry.active = false;
        entry.updatedAt = uint64(block.timestamp);
        emit PayerRevoked(payer);
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
}
