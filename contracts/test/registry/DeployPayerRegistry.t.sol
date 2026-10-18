// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Test} from "forge-std/Test.sol";
import {DeployPayerRegistry} from "../../script/DeployPayerRegistry.s.sol";
import {PayerRegistry} from "../../src/registry/PayerRegistry.sol";

contract DeployPayerRegistryTest is Test {
    uint256 internal constant TEST_KEY = 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80;

    function test_TheDeployerOwnsTheRegistry() public {
        vm.setEnv("PRIVATE_KEY", vm.toString(bytes32(TEST_KEY)));
        PayerRegistry registry = new DeployPayerRegistry().run();
        assertEq(registry.owner(), vm.addr(TEST_KEY));
        assertFalse(registry.isKnownPayer(address(1)));
    }
}
