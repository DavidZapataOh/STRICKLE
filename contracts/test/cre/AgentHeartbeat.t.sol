// contracts/test/cre/AgentHeartbeat.t.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Test} from "forge-std/Test.sol";
import {AgentHeartbeat} from "../../src/cre/AgentHeartbeat.sol";

contract AgentHeartbeatTest is Test {
    address forwarder = makeAddr("forwarder");
    address owner = makeAddr("owner");
    address seen = makeAddr("seen");
    bytes32 workflow = keccak256("strickle-agent");
    AgentHeartbeat beat;

    function setUp() public {
        beat = new AgentHeartbeat(forwarder, owner);
        vm.prank(owner);
        beat.setExpectedWorkflowId(workflow);
    }

    function deliver(uint64 updatedAt) internal {
        bytes memory meta = new bytes(64);
        bytes32 id = workflow;
        assembly ("memory-safe") {
            mstore(add(meta, 32), id)
        }
        vm.prank(forwarder);
        beat.onReport(meta, abi.encode(updatedAt, seen));
    }

    function test_recordsTheTickAndWhatTheWorkflowRead() public {
        vm.expectEmit(true, false, false, true);
        emit AgentHeartbeat.Tick(workflow, 1_000, seen);
        deliver(1_000);
        assertEq(beat.lastTick(), 1_000);
        assertEq(beat.lastSeen(), seen);
        assertEq(beat.ticks(), 1);
    }

    function test_aReplayedOrOlderTickNeverMovesTimeBackwards() public {
        deliver(2_000);
        deliver(1_000);
        assertEq(beat.lastTick(), 2_000);
        assertEq(beat.ticks(), 1);
        deliver(2_000);
        assertEq(beat.ticks(), 1);
    }
}
