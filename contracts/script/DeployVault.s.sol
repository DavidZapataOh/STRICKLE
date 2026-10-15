// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Script} from "forge-std/Script.sol";
import {BoxVault} from "../src/vault/BoxVault.sol";
import {BoxVaultFactory} from "../src/vault/BoxVaultFactory.sol";

contract DeployVault is Script {
    address internal constant USDC = 0x3600000000000000000000000000000000000000;
    address internal constant EURC_TESTNET = 0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a;
    address internal constant EURC_MAINNET = 0xbEf5f6d51CB62b58e6A8f77868681825C6fe21c1;

    function run() external returns (BoxVault implementation, BoxVaultFactory factory) {
        address eurc = block.chainid == 5042002 ? EURC_TESTNET : EURC_MAINNET;
        vm.startBroadcast(vm.envUint("PRIVATE_KEY"));
        implementation = new BoxVault{salt: keccak256("strickle.box-vault.v1")}(USDC, eurc);
        factory = new BoxVaultFactory{salt: keccak256("strickle.box-vault-factory.v1")}(address(implementation));
        vm.stopBroadcast();
    }
}
