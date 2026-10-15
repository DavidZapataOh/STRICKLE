// contracts/script/DeployAgentState.s.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Script} from "forge-std/Script.sol";
import {AgentState} from "../src/cre/AgentState.sol";

contract DeployAgentState is Script {
    function run() external returns (AgentState state) {
        uint256 key = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(key);
        state = new AgentState{salt: keccak256("strickle.agent-state.v1")}(vm.envAddress("CRE_FORWARDER"), vm.addr(key));
        vm.stopBroadcast();
    }
}
