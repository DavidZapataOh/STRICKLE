// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Test} from "forge-std/Test.sol";
import {AssociationRegistry} from "../../src/pool/AssociationRegistry.sol";

contract AssociationRegistryTest is Test {
    AssociationRegistry internal registry;
    address internal owner = makeAddr("owner");
    address internal provider = makeAddr("provider");
    address internal other = makeAddr("other");
    address internal stranger = makeAddr("stranger");
    bytes32 internal constant EVIDENCE = keccak256("policy v1");
    uint256 internal constant ROOT = 0x1234;

    function setUp() public {
        vm.warp(1_900_000_000);
        registry = new AssociationRegistry(owner);
        vm.startPrank(owner);
        registry.setProvider(provider, true);
        registry.setProvider(other, true);
        vm.stopPrank();
    }

    function test_OnlyProvidersPublish() public {
        vm.prank(stranger);
        vm.expectRevert(AssociationRegistry.NotProvider.selector);
        registry.publish(ROOT, EVIDENCE);
        vm.prank(owner);
        vm.expectRevert(AssociationRegistry.NotProvider.selector);
        registry.publish(ROOT, EVIDENCE);
        vm.prank(provider);
        registry.publish(ROOT, EVIDENCE);
        assertTrue(registry.isApproved(ROOT));
    }

    function test_APublishedSetRecordsItsProviderTimeAndEvidence() public {
        vm.expectEmit(true, true, false, true, address(registry));
        emit AssociationRegistry.SetPublished(ROOT, provider, EVIDENCE);
        vm.prank(provider);
        registry.publish(ROOT, EVIDENCE);
        (address by, uint64 at, bytes32 evidence, bool revoked) = registry.setOf(ROOT);
        assertEq(by, provider);
        assertEq(at, block.timestamp);
        assertEq(evidence, EVIDENCE);
        assertFalse(revoked);
    }

    function test_ARootCannotBePublishedTwiceNorOutsideTheField() public {
        vm.prank(provider);
        registry.publish(ROOT, EVIDENCE);
        vm.prank(other);
        vm.expectRevert(AssociationRegistry.AlreadyPublished.selector);
        registry.publish(ROOT, EVIDENCE);
        uint256 modulus = 21888242871839275222246405745257275088548364400416034343698204186575808495617;
        vm.prank(provider);
        vm.expectRevert(abi.encodeWithSelector(AssociationRegistry.NotFieldElement.selector, modulus));
        registry.publish(modulus, EVIDENCE);
        vm.prank(provider);
        vm.expectRevert(abi.encodeWithSelector(AssociationRegistry.NotFieldElement.selector, 0));
        registry.publish(0, EVIDENCE);
    }

    function test_UnknownRootsAreNotApproved() public view {
        assertFalse(registry.isApproved(ROOT));
        assertFalse(registry.isApproved(0));
    }

    function test_ThePublisherOrTheOwnerRevokesAndNobodyElse() public {
        vm.prank(provider);
        registry.publish(ROOT, EVIDENCE);
        vm.prank(other);
        vm.expectRevert(AssociationRegistry.NotAuthorized.selector);
        registry.revoke(ROOT);
        vm.prank(stranger);
        vm.expectRevert(AssociationRegistry.NotAuthorized.selector);
        registry.revoke(ROOT);
        vm.prank(provider);
        registry.revoke(ROOT);
        assertFalse(registry.isApproved(ROOT));

        vm.prank(provider);
        registry.publish(ROOT + 1, EVIDENCE);
        vm.prank(owner);
        registry.revoke(ROOT + 1);
        assertFalse(registry.isApproved(ROOT + 1));
    }

    function test_ARevokedRootStaysRevokedAndCannotBeRepublished() public {
        vm.prank(provider);
        registry.publish(ROOT, EVIDENCE);
        vm.prank(provider);
        registry.revoke(ROOT);
        vm.prank(provider);
        vm.expectRevert(AssociationRegistry.AlreadyPublished.selector);
        registry.publish(ROOT, EVIDENCE);
        assertFalse(registry.isApproved(ROOT));
    }

    function test_RevokingAnUnknownRootFails() public {
        vm.prank(owner);
        vm.expectRevert(AssociationRegistry.NotPublished.selector);
        registry.revoke(ROOT);
    }

    function test_TheOwnerManagesProvidersAndOwnershipMovesInTwoSteps() public {
        vm.prank(stranger);
        vm.expectRevert(AssociationRegistry.NotOwner.selector);
        registry.setProvider(stranger, true);
        vm.prank(owner);
        registry.setProvider(provider, false);
        vm.prank(provider);
        vm.expectRevert(AssociationRegistry.NotProvider.selector);
        registry.publish(ROOT, EVIDENCE);

        vm.prank(owner);
        registry.transferOwnership(stranger);
        vm.prank(other);
        vm.expectRevert(AssociationRegistry.NotOwner.selector);
        registry.acceptOwnership();
        vm.prank(stranger);
        registry.acceptOwnership();
        assertEq(registry.owner(), stranger);
    }
}
