// contracts/script/DeployAgentHeartbeat.s.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Script} from "forge-std/Script.sol";
import {AgentHeartbeat} from "../src/cre/AgentHeartbeat.sol";

contract DeployAgentHeartbeat is Script {
    function run() external returns (AgentHeartbeat beat) {
        uint256 key = vm.envUint("PRIVATE_KEY");
        address forwarder = vm.envAddress("CRE_FORWARDER");
        vm.startBroadcast(key);
        beat = new AgentHeartbeat{salt: keccak256("strickle.agent-heartbeat.v1")}(forwarder, vm.addr(key));
        vm.stopBroadcast();
    }
}
