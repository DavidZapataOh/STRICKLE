// contracts/src/cre/AgentState.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {CreReceiver} from "./CreReceiver.sol";

interface IOwned {
    function owner() external view returns (address);
}

/// @notice Rendezvous for each vault's sealedData profile (written by its owner) and the agent's encrypted state
/// (written only by the agent). Payloads are ciphertext published as event data; storage keeps one pointer.
contract AgentState is CreReceiver {
    error NotVaultOwner();
    error ProfileTooLarge();
    error StateTooLarge();
    error NoticeTooLarge();
    error StaleVersion(uint64 expected, uint64 got);
    error StaleNotice(uint64 expected, uint64 got);
    error NotExecutor();

    event ProfileSubmitted(address indexed vault, uint64 indexed profileId, bytes sealedData);
    event StateUpdated(address indexed vault, uint64 indexed version, bytes ciphertext);
    event Notice(address indexed vault, uint64 indexed id, bytes sealedData);
    event EnclaveKeySet(bytes32 key);
    event ExecutorSet(address indexed executor);

    struct Head {
        uint64 version;
        uint64 updatedAt;
        uint64 applied;
    }

    uint256 public constant MAX_PROFILE = 4_800;
    uint256 public constant MAX_STATE = 16_384;
    uint256 public constant MAX_NOTICE = 4_096;

    bytes32 public enclaveKey;
    address public executor;
    mapping(address vault => uint64) public profileId;
    mapping(address vault => uint64) public noticeCount;
    mapping(address vault => Head) public head;

    constructor(address forwarder_, address owner_) CreReceiver(forwarder_, owner_) {}

    function setEnclaveKey(bytes32 key) external {
        if (msg.sender != owner) revert NotOwner();
        enclaveKey = key;
        emit EnclaveKeySet(key);
    }

    function setExecutor(address executor_) external {
        if (msg.sender != owner) revert NotOwner();
        executor = executor_;
        emit ExecutorSet(executor_);
    }

    function store(address vault, uint64 next, bytes calldata ciphertext) external {
        if (msg.sender != executor) revert NotExecutor();
        _write(vault, next, ciphertext);
    }

    function notify(address vault, uint64 id, bytes calldata sealedData) external {
        if (msg.sender != executor) revert NotExecutor();
        if (sealedData.length > MAX_NOTICE) revert NoticeTooLarge();
        uint64 expected = noticeCount[vault] + 1;
        if (id != expected) revert StaleNotice(expected, id);
        noticeCount[vault] = id;
        emit Notice(vault, id, sealedData);
    }

    function submitProfile(address vault, bytes calldata sealedData) external {
        if (IOwned(vault).owner() != msg.sender) revert NotVaultOwner();
        if (sealedData.length > MAX_PROFILE) revert ProfileTooLarge();
        uint64 id;
        unchecked {
            id = ++profileId[vault];
        }
        emit ProfileSubmitted(vault, id, sealedData);
    }

    function _processReport(bytes32, bytes calldata report) internal override {
        (address vault, uint64 next, uint64 profileApplied, bytes memory ciphertext) =
            abi.decode(report, (address, uint64, uint64, bytes));
        if (profileApplied != 0 && profileApplied <= head[vault].applied) return;
        _write(vault, next, ciphertext);
        if (profileApplied != 0) head[vault].applied = profileApplied;
    }

    function _write(address vault, uint64 next, bytes memory ciphertext) private {
        Head storage h = head[vault];
        uint64 expected = h.version + 1;
        if (next != expected) revert StaleVersion(expected, next);
        if (ciphertext.length > MAX_STATE) revert StateTooLarge();
        h.version = next;
        h.updatedAt = uint64(block.number);
        emit StateUpdated(vault, next, ciphertext);
    }
}
