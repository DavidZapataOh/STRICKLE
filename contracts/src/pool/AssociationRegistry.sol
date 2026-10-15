// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

interface IAssociation {
    function isApproved(uint256 root) external view returns (bool);
}

/// @notice Association set providers publish the Merkle root of the deposit labels they vouch for; a
/// withdrawal that proves membership of its label in an approved root shows its funds come from that set.
/// The pool accepts any approved root: wallets choose the provider whose set the receiving side trusts.
contract AssociationRegistry is IAssociation {
    uint256 private constant P = 21888242871839275222246405745257275088548364400416034343698204186575808495617;

    struct SetInfo {
        address provider;
        uint64 publishedAt;
        bytes32 evidence;
        bool revoked;
    }

    error NotOwner();
    error NotProvider();
    error NotAuthorized();
    error AlreadyPublished();
    error NotPublished();
    error NotFieldElement(uint256 value);

    event SetPublished(uint256 indexed root, address indexed provider, bytes32 evidence);
    event SetRevoked(uint256 indexed root);
    event ProviderSet(address indexed provider, bool allowed);
    event OwnershipTransferStarted(address pendingOwner);
    event OwnershipTransferred(address owner);

    address public owner;
    address public pendingOwner;
    mapping(address provider => bool) public isProvider;
    mapping(uint256 root => SetInfo) private sets;

    constructor(address owner_) {
        owner = owner_;
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    function isApproved(uint256 root) external view returns (bool) {
        SetInfo memory info = sets[root];
        return info.provider != address(0) && !info.revoked;
    }

    function setOf(uint256 root)
        external
        view
        returns (address provider, uint64 publishedAt, bytes32 evidence, bool revoked)
    {
        SetInfo memory info = sets[root];
        return (info.provider, info.publishedAt, info.evidence, info.revoked);
    }

    function publish(uint256 root, bytes32 evidence) external {
        if (!isProvider[msg.sender]) revert NotProvider();
        if (root == 0 || root >= P) revert NotFieldElement(root);
        if (sets[root].provider != address(0)) revert AlreadyPublished();
        sets[root] = SetInfo(msg.sender, uint64(block.timestamp), evidence, false);
        emit SetPublished(root, msg.sender, evidence);
    }

    function revoke(uint256 root) external {
        SetInfo storage info = sets[root];
        if (info.provider == address(0)) revert NotPublished();
        if (msg.sender != info.provider && msg.sender != owner) revert NotAuthorized();
        info.revoked = true;
        emit SetRevoked(root);
    }

    function setProvider(address provider, bool allowed) external onlyOwner {
        isProvider[provider] = allowed;
        emit ProviderSet(provider, allowed);
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
