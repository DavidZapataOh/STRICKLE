// contracts/src/cre/AgentHeartbeat.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {CreReceiver} from "./CreReceiver.sol";

/// @notice Liveness record of the agent workflow: when it last ran and the contract state it read.
contract AgentHeartbeat is CreReceiver {
    event Tick(bytes32 indexed workflowId, uint64 tickedAt, address seen);

    uint64 public lastTick;
    uint32 public ticks;
    address public lastSeen;

    constructor(address forwarder_, address owner_) CreReceiver(forwarder_, owner_) {}

    function _processReport(bytes32 workflowId, bytes calldata report) internal override {
        (uint64 tickedAt, address seen) = abi.decode(report, (uint64, address));
        if (tickedAt <= lastTick) return;
        lastTick = tickedAt;
        lastSeen = seen;
        unchecked {
            ++ticks;
        }
        emit Tick(workflowId, tickedAt, seen);
    }
}
