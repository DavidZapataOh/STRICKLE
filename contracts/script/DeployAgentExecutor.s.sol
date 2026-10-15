// contracts/script/DeployAgentExecutor.s.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Script} from "forge-std/Script.sol";
import {AgentExecutor} from "../src/cre/AgentExecutor.sol";

contract DeployAgentExecutor is Script {
    function run() external returns (AgentExecutor executor) {
        uint256 key = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(key);
        executor = new AgentExecutor{salt: keccak256("strickle.agent-executor.v1")}(
            vm.envAddress("CRE_FORWARDER"),
            vm.addr(key),
            vm.envAddress("BOX_VAULT_FACTORY"),
            vm.envAddress("AGENT_STATE"),
            vm.envAddress("POLICY_POOL")
        );
        vm.stopBroadcast();
    }
}
