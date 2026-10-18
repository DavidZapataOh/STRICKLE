// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Test} from "forge-std/Test.sol";
import {PayerRegistry} from "../../src/registry/PayerRegistry.sol";

contract PayerRegistryTest is Test {
    PayerRegistry internal registry;
    address internal owner = makeAddr("owner");
    address internal stranger = makeAddr("stranger");
    address internal payer = makeAddr("payer");
    bytes32 internal constant META = keccak256("entry");

    event PayerAdded(address indexed payer, PayerRegistry.Category category, bytes32 metadata);
    event PayerRevoked(address indexed payer);

    function setUp() public {
        vm.warp(1_900_000_000);
        registry = new PayerRegistry(owner);
    }

    function test_AnUnlistedAddressIsNotKnown() public view {
        assertFalse(registry.isKnownPayer(payer));
        (bool known,) = registry.categoryOf(payer);
        assertFalse(known);
    }

    function test_TheOwnerAddsAnEntryAndTheViewsReadItBack() public {
        vm.expectEmit(true, false, false, true);
        emit PayerAdded(payer, PayerRegistry.Category.Dao, META);
        vm.prank(owner);
        registry.add(payer, PayerRegistry.Category.Dao, META);

        assertTrue(registry.isKnownPayer(payer));
        (bool known, PayerRegistry.Category category) = registry.categoryOf(payer);
        assertTrue(known);
        assertEq(uint8(category), uint8(PayerRegistry.Category.Dao));
        (bool k, PayerRegistry.Category c, bytes32 meta, uint64 updatedAt) = registry.entryOf(payer);
        assertTrue(k);
        assertEq(uint8(c), uint8(PayerRegistry.Category.Dao));
        assertEq(meta, META);
        assertEq(updatedAt, block.timestamp);
    }

    function test_OnlyTheOwnerWrites() public {
        vm.prank(stranger);
        vm.expectRevert(PayerRegistry.NotOwner.selector);
        registry.add(payer, PayerRegistry.Category.Payroll, META);

        vm.prank(owner);
        registry.add(payer, PayerRegistry.Category.Payroll, META);

        vm.prank(stranger);
        vm.expectRevert(PayerRegistry.NotOwner.selector);
        registry.revoke(payer);
    }

    function test_TheZeroAddressAndDoubleAddsRevert() public {
        vm.startPrank(owner);
        vm.expectRevert(PayerRegistry.ZeroAddress.selector);
        registry.add(address(0), PayerRegistry.Category.Grants, META);
        registry.add(payer, PayerRegistry.Category.Grants, META);
        vm.expectRevert(PayerRegistry.AlreadyKnown.selector);
        registry.add(payer, PayerRegistry.Category.Dao, META);
        vm.stopPrank();
    }

    function test_RevokingAnUnknownOrRevokedEntryReverts() public {
        vm.startPrank(owner);
        vm.expectRevert(PayerRegistry.NotKnown.selector);
        registry.revoke(payer);
        registry.add(payer, PayerRegistry.Category.Dao, META);
        registry.revoke(payer);
        vm.expectRevert(PayerRegistry.NotKnown.selector);
        registry.revoke(payer);
        vm.stopPrank();
    }

    function test_ARevokedEntryIsNotKnownButKeepsItsRecord() public {
        vm.startPrank(owner);
        registry.add(payer, PayerRegistry.Category.PaymentRail, META);
        vm.warp(block.timestamp + 1 days);
        vm.expectEmit(true, false, false, false);
        emit PayerRevoked(payer);
        registry.revoke(payer);
        vm.stopPrank();

        assertFalse(registry.isKnownPayer(payer));
        (bool known,) = registry.categoryOf(payer);
        assertFalse(known);
        (bool k, PayerRegistry.Category c, bytes32 meta, uint64 updatedAt) = registry.entryOf(payer);
        assertFalse(k);
        assertEq(uint8(c), uint8(PayerRegistry.Category.PaymentRail));
        assertEq(meta, META);
        assertEq(updatedAt, block.timestamp);
    }

    function test_ReAddingARevokedEntryRestoresItWithNewData() public {
        vm.startPrank(owner);
        registry.add(payer, PayerRegistry.Category.Payroll, META);
        registry.revoke(payer);
        registry.add(payer, PayerRegistry.Category.Grants, keccak256("v2"));
        vm.stopPrank();

        assertTrue(registry.isKnownPayer(payer));
        (, PayerRegistry.Category c, bytes32 meta,) = registry.entryOf(payer);
        assertEq(uint8(c), uint8(PayerRegistry.Category.Grants));
        assertEq(meta, keccak256("v2"));
    }

    function test_OwnershipMovesInTwoSteps() public {
        vm.prank(owner);
        registry.transferOwnership(stranger);
        assertEq(registry.owner(), owner);
        assertEq(registry.pendingOwner(), stranger);

        vm.prank(payer);
        vm.expectRevert(PayerRegistry.NotOwner.selector);
        registry.acceptOwnership();

        vm.prank(stranger);
        registry.acceptOwnership();
        assertEq(registry.owner(), stranger);
        assertEq(registry.pendingOwner(), address(0));

        vm.prank(owner);
        vm.expectRevert(PayerRegistry.NotOwner.selector);
        registry.add(payer, PayerRegistry.Category.Dao, META);
        vm.prank(stranger);
        registry.add(payer, PayerRegistry.Category.Dao, META);
    }

    function test_OnlyTheOwnerStartsATransfer() public {
        vm.prank(stranger);
        vm.expectRevert(PayerRegistry.NotOwner.selector);
        registry.transferOwnership(stranger);
    }

    function testFuzz_AnyOperationSequenceMatchesTheModel(uint256 seed, uint8 steps) public {
        address[4] memory pool = [address(0xA1), address(0xA2), address(0xA3), address(0xA4)];
        bool[4] memory model;
        for (uint256 i = 0; i < steps; ++i) {
            seed = uint256(keccak256(abi.encode(seed, i)));
            uint256 who = seed % 4;
            bool doAdd = (seed >> 8) % 2 == 0;
            PayerRegistry.Category category = PayerRegistry.Category((seed >> 16) % 4);
            vm.prank(owner);
            if (doAdd) {
                if (model[who]) {
                    vm.expectRevert(PayerRegistry.AlreadyKnown.selector);
                    registry.add(pool[who], category, bytes32(seed));
                } else {
                    registry.add(pool[who], category, bytes32(seed));
                    model[who] = true;
                }
            } else {
                if (model[who]) {
                    registry.revoke(pool[who]);
                    model[who] = false;
                } else {
                    vm.expectRevert(PayerRegistry.NotKnown.selector);
                    registry.revoke(pool[who]);
                }
            }
            for (uint256 j = 0; j < 4; ++j) {
                assertEq(registry.isKnownPayer(pool[j]), model[j]);
            }
        }
    }

    function testFuzz_AnAddressNeverAddedIsNeverKnown(address who) public view {
        assertFalse(registry.isKnownPayer(who));
    }
}
