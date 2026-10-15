// contracts/src/cre/CreReceiver.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {IReceiver, IERC165} from "./IReceiver.sol";

/// @notice Base for every contract the Strickle agent writes to. A report is accepted only from the
/// forwarder and only when it was produced by the one workflow the owner named. Every workflow in an
/// organization shares one owner, so the workflow ID is the only identity that separates them.
abstract contract CreReceiver is IReceiver {
    error NotForwarder();
    error NotOwner();
    error WorkflowNotSet();
    error WrongWorkflow(bytes32 got);
    error BadMetadata();

    event ExpectedWorkflowSet(bytes32 indexed previous, bytes32 indexed next);

    address public immutable forwarder;
    address public immutable owner;
    bytes32 public expectedWorkflowId;

    constructor(address forwarder_, address owner_) {
        forwarder = forwarder_;
        owner = owner_;
    }

    function setExpectedWorkflowId(bytes32 id) external {
        if (msg.sender != owner) revert NotOwner();
        emit ExpectedWorkflowSet(expectedWorkflowId, id);
        expectedWorkflowId = id;
    }

    function onReport(bytes calldata metadata, bytes calldata report) external {
        if (msg.sender != forwarder) revert NotForwarder();
        if (metadata.length != 62 && metadata.length != 64) revert BadMetadata();
        bytes32 expected = expectedWorkflowId;
        if (expected == bytes32(0)) revert WorkflowNotSet();
        bytes32 id = bytes32(metadata[0:32]);
        if (id != expected) revert WrongWorkflow(id);
        _processReport(id, report);
    }

    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        return interfaceId == type(IReceiver).interfaceId || interfaceId == type(IERC165).interfaceId;
    }

    function _processReport(bytes32 workflowId, bytes calldata report) internal virtual;
}
