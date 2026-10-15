// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Script} from "forge-std/Script.sol";
import {PayerRegistry} from "../src/registry/PayerRegistry.sol";

/// @dev Testnet bootstrap: the deployer owns the registry and lists the payers afterwards.
contract DeployPayerRegistry is Script {
    function run() external returns (PayerRegistry registry) {
        uint256 key = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(key);
        registry = new PayerRegistry{salt: keccak256("strickle.payer-registry.v1")}(vm.addr(key));
        vm.stopBroadcast();
    }
}
