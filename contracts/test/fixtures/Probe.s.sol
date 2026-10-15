// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Script} from "forge-std/Script.sol";
import {Probe} from "./Probe.sol";

contract ProbeScript is Script {
    function run() external returns (Probe probe) {
        bytes32 salt = vm.envOr("PROBE_SALT", keccak256("probe.v1"));
        vm.startBroadcast(vm.envUint("PRIVATE_KEY"));
        probe = new Probe{salt: salt}();
        vm.stopBroadcast();
    }
}
