// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Script} from "forge-std/Script.sol";
import {ShieldVerifier} from "../src/pool/verifiers/ShieldVerifier.sol";
import {SpendVerifier} from "../src/pool/verifiers/SpendVerifier.sol";

contract DeployVerifiers is Script {
    function run() external returns (ShieldVerifier shield, SpendVerifier spend) {
        bytes32 shieldSalt = keccak256("strickle.shield-verifier.v1");
        bytes32 spendSalt = keccak256("strickle.spend-verifier.v1");
        address shieldAt =
            vm.computeCreate2Address(shieldSalt, keccak256(type(ShieldVerifier).creationCode), CREATE2_FACTORY);
        address spendAt =
            vm.computeCreate2Address(spendSalt, keccak256(type(SpendVerifier).creationCode), CREATE2_FACTORY);

        vm.startBroadcast(vm.envUint("PRIVATE_KEY"));
        shield = shieldAt.code.length > 0 ? ShieldVerifier(shieldAt) : new ShieldVerifier{salt: shieldSalt}();
        spend = spendAt.code.length > 0 ? SpendVerifier(spendAt) : new SpendVerifier{salt: spendSalt}();
        vm.stopBroadcast();
    }
}
