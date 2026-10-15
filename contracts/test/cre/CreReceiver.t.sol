// contracts/test/cre/CreReceiver.t.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Test} from "forge-std/Test.sol";
import {CreReceiver} from "../../src/cre/CreReceiver.sol";
import {IReceiver} from "../../src/cre/IReceiver.sol";

contract Sink is CreReceiver {
    bytes32 public lastWorkflow;
    bytes public lastReport;

    constructor(address forwarder_, address owner_) CreReceiver(forwarder_, owner_) {}

    function _processReport(bytes32 workflowId, bytes calldata report) internal override {
        lastWorkflow = workflowId;
        lastReport = report;
    }
}

contract CreReceiverTest is Test {
    address forwarder = makeAddr("forwarder");
    address owner = makeAddr("owner");
    bytes32 workflow = keccak256("strickle-agent");
    Sink sink;

    function setUp() public {
        sink = new Sink(forwarder, owner);
        vm.prank(owner);
        sink.setExpectedWorkflowId(workflow);
    }

    function meta(bytes32 id, uint256 length) internal pure returns (bytes memory m) {
        m = new bytes(length);
        assembly ("memory-safe") {
            mstore(add(m, 32), id)
        }
    }

    function test_acceptsTheForwarderWithTheExpectedWorkflow() public {
        vm.prank(forwarder);
        sink.onReport(meta(workflow, 64), hex"c0ffee");
        assertEq(sink.lastWorkflow(), workflow);
        assertEq(sink.lastReport(), hex"c0ffee");
    }

    function test_accepts62ByteMetadata() public {
        vm.prank(forwarder);
        sink.onReport(meta(workflow, 62), hex"01");
        assertEq(sink.lastWorkflow(), workflow);
    }

    function test_rejectsEveryoneButTheForwarder() public {
        vm.prank(owner);
        vm.expectRevert(CreReceiver.NotForwarder.selector);
        sink.onReport(meta(workflow, 64), hex"01");
    }

    function test_rejectsAnotherWorkflowOfTheSameOwner() public {
        bytes32 other = keccak256("caplane-registry");
        vm.prank(forwarder);
        vm.expectRevert(abi.encodeWithSelector(CreReceiver.WrongWorkflow.selector, other));
        sink.onReport(meta(other, 64), hex"01");
    }

    function test_failsClosedWhileNoWorkflowIsSet() public {
        Sink fresh = new Sink(forwarder, owner);
        vm.prank(forwarder);
        vm.expectRevert(CreReceiver.WorkflowNotSet.selector);
        fresh.onReport(meta(workflow, 64), hex"01");
    }

    function test_rejectsMetadataOfTheWrongLength() public {
        vm.startPrank(forwarder);
        vm.expectRevert(CreReceiver.BadMetadata.selector);
        sink.onReport(meta(workflow, 61), hex"01");
        vm.expectRevert(CreReceiver.BadMetadata.selector);
        sink.onReport(meta(workflow, 65), hex"01");
        vm.stopPrank();
    }

    function test_changingTheWorkflowRevokesTheOldOne() public {
        bytes32 next = keccak256("strickle-agent-v2");
        vm.prank(owner);
        sink.setExpectedWorkflowId(next);
        vm.prank(forwarder);
        vm.expectRevert(abi.encodeWithSelector(CreReceiver.WrongWorkflow.selector, workflow));
        sink.onReport(meta(workflow, 64), hex"01");
        vm.prank(forwarder);
        sink.onReport(meta(next, 64), hex"02");
        assertEq(sink.lastWorkflow(), next);
    }

    function test_onlyTheOwnerSetsTheWorkflow() public {
        vm.expectRevert(CreReceiver.NotOwner.selector);
        sink.setExpectedWorkflowId(bytes32(uint256(1)));
    }

    function test_announcesTheReceiverInterface() public view {
        assertTrue(sink.supportsInterface(type(IReceiver).interfaceId));
        assertTrue(sink.supportsInterface(0x01ffc9a7));
        assertFalse(sink.supportsInterface(0xffffffff));
    }
}
