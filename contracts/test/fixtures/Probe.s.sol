// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Script} from "forge-std/Script.sol";
import {Probe} from "./Probe.sol";

contract ProbeScript is Script {
    bytes32 internal constant SALT = keccak256("probe.v1");

    function run() external returns (Probe probe) {
        vm.startBroadcast(vm.envUint("PRIVATE_KEY"));
        probe = new Probe{salt: SALT}();
        vm.stopBroadcast();
    }
}
