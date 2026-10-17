// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Test} from "forge-std/Test.sol";
import {BoxLedger} from "../src/vault/BoxLedger.sol";
import {BoxVault} from "../src/vault/BoxVault.sol";
import {BoxVaultFactory} from "../src/vault/BoxVaultFactory.sol";
import {TestToken} from "./fixtures/TestToken.sol";
import {Vaults} from "./fixtures/Vaults.sol";

/// The app classifies a rule change as immediate or delayed before it asks the owner to sign. This test runs the same
/// cases (one shared JSON file) against the vault itself, so the screen can never promise something the contract will not do.
contract RuleChangeFixtureTest is Test {
    uint8 internal constant BOX = 4; // starts with the zero rule, so any first rule applies at once

    BoxVaultFactory factory;

    function setUp() public {
        TestToken usdc = new TestToken();
        TestToken eurc = new TestToken();
        factory = new BoxVaultFactory(address(Vaults.newVault(usdc, eurc)));
    }

    function ruleAt(string memory json, string memory path) internal pure returns (BoxLedger.Rule memory) {
        return BoxLedger.Rule({
            delay: uint32(vm.parseJsonUint(json, string.concat(path, ".delay"))),
            alwaysDelayed: vm.parseJsonBool(json, string.concat(path, ".alwaysDelayed")),
            restricted: vm.parseJsonBool(json, string.concat(path, ".restricted")),
            floor: uint128(vm.parseJsonUint(json, string.concat(path, ".floor"))),
            lockedUntil: uint64(vm.parseJsonUint(json, string.concat(path, ".lockedUntil")))
        });
    }

    function test_theContractClassifiesEveryFixtureCaseTheWayTheScreenDoes() public {
        string memory json = vm.readFile("../apps/app/tests/fixtures/rule-changes.json");
        string[] memory names = abi.decode(vm.parseJson(json, ".cases[*].name"), (string[]));
        assertGt(names.length, 0);
        for (uint256 i; i < names.length; ++i) {
            string memory where = string.concat(".cases[", vm.toString(i), "]");
            BoxLedger.Rule memory current = ruleAt(json, string.concat(where, ".current"));
            BoxLedger.Rule memory next = ruleAt(json, string.concat(where, ".next"));
            address owner = makeAddr(string.concat("owner", vm.toString(i)));
            BoxVault vault = BoxVault(factory.create(owner));
            vm.startPrank(owner);
            vault.setRule(BOX, current);
            vault.setRule(BOX, next);
            vm.stopPrank();
            (, uint64 effectiveAt, bool open) = vault.ruleChanges(BOX);
            bool immediate =
                keccak256(bytes(vm.parseJsonString(json, string.concat(where, ".expected")))) == keccak256("immediate");
            if (immediate) {
                assertFalse(open, names[i]);
            } else {
                assertTrue(open, names[i]);
                uint256 wait = current.delay > 1 days ? current.delay : 1 days;
                assertEq(vm.parseJsonUint(json, string.concat(where, ".waitSeconds")), wait, names[i]);
                assertEq(effectiveAt, block.timestamp + wait, names[i]);
            }
        }
    }
}
