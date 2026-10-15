// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Script} from "forge-std/Script.sol";
import {Poseidon2Hasher} from "../src/pool/Poseidon2Hasher.sol";

contract DeployHasher is Script {
    function run() external returns (Poseidon2Hasher hasher) {
        vm.startBroadcast(vm.envUint("PRIVATE_KEY"));
        hasher = new Poseidon2Hasher{salt: keccak256("strickle.poseidon2-hasher.v1")}();
        vm.stopBroadcast();
    }
}
