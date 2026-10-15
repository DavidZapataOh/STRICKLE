// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Test} from "forge-std/Test.sol";
import {Probe} from "./fixtures/Probe.sol";

contract ProbeTest is Test {
    Probe internal probe;

    function setUp() public {
        probe = new Probe();
    }

    function test_IncrementAddsOne() public {
        probe.increment();
        assertEq(probe.number(), 1);
    }

    function testFuzz_IncrementCountsEveryCall(uint8 times) public {
        for (uint256 i; i < times; ++i) {
            probe.increment();
        }
        assertEq(probe.number(), times);
    }
}

contract ProbeHandler {
    Probe internal immutable probe;
    uint256 public calls;

    constructor(Probe probe_) {
        probe = probe_;
    }

    function increment() external {
        probe.increment();
        ++calls;
    }
}

contract ProbeInvariantTest is Test {
    Probe internal probe;
    ProbeHandler internal handler;

    function setUp() public {
        probe = new Probe();
        handler = new ProbeHandler(probe);
        targetContract(address(handler));
    }

    function invariant_NumberEqualsHandledCalls() public view {
        assertEq(probe.number(), handler.calls());
    }
}
