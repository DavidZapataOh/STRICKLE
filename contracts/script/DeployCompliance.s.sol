// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Script} from "forge-std/Script.sol";
import {AssociationRegistry} from "../src/pool/AssociationRegistry.sol";
import {ScreeningRegistry} from "../src/pool/ScreeningRegistry.sol";

/// @dev Testnet bootstrap: the deployer owns both registries and is their first screener and provider.
contract DeployCompliance is Script {
    function run() external returns (ScreeningRegistry screening, AssociationRegistry association) {
        uint256 key = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(key);
        uint64 ttl = uint64(vm.envOr("SCREENING_TTL", uint256(30 days)));
        vm.startBroadcast(key);
        screening = new ScreeningRegistry{salt: keccak256("strickle.screening-registry.v1")}(deployer, ttl);
        association = new AssociationRegistry{salt: keccak256("strickle.association-registry.v1")}(deployer);
        screening.setScreener(deployer, true);
        association.setProvider(deployer, true);
        vm.stopBroadcast();
    }
}
