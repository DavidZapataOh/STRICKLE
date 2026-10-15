// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Script} from "forge-std/Script.sol";
import {ShieldVerifier} from "../src/pool/verifiers/ShieldVerifier.sol";
import {SpendVerifier} from "../src/pool/verifiers/SpendVerifier.sol";

contract DeployVerifiers is Script {
    function run() external returns (ShieldVerifier shield, SpendVerifier spend) {
        vm.startBroadcast(vm.envUint("PRIVATE_KEY"));
        shield = new ShieldVerifier{salt: keccak256("strickle.shield-verifier.v1")}();
        spend = new SpendVerifier{salt: keccak256("strickle.spend-verifier.v1")}();
        vm.stopBroadcast();
    }
}
