// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Test} from "forge-std/Test.sol";
import {ScreeningRegistry} from "../../src/pool/ScreeningRegistry.sol";

contract ScreeningRegistryTest is Test {
    ScreeningRegistry internal registry;
    address internal owner = makeAddr("owner");
    address internal screener = makeAddr("screener");
    address internal stranger = makeAddr("stranger");
    address internal alice = makeAddr("alice");
    bytes32 internal constant EVIDENCE = keccak256("report");
    uint64 internal constant TTL = 30 days;

    function setUp() public {
        vm.warp(1_900_000_000);
        registry = new ScreeningRegistry(owner, TTL);
        vm.prank(owner);
        registry.setScreener(screener, true);
    }

    function test_AnAddressWithNoRecordIsClearButNotFresh() public view {
        (uint8 risk, bool fresh) = registry.status(alice);
        assertEq(risk, 0);
        assertFalse(fresh);
    }

    function test_OnlyScreenersWrite() public {
        vm.prank(stranger);
        vm.expectRevert(ScreeningRegistry.NotScreener.selector);
        registry.setRisk(alice, 0, EVIDENCE);
        vm.prank(owner);
        vm.expectRevert(ScreeningRegistry.NotScreener.selector);
        registry.setRisk(alice, 0, EVIDENCE);
        vm.prank(screener);
        registry.setRisk(alice, 0, EVIDENCE);
    }

    function test_ARecordIsFreshForTheTtlAndThenStale() public {
        vm.prank(screener);
        registry.setRisk(alice, 1, EVIDENCE);
        (uint8 risk, bool fresh) = registry.status(alice);
        assertEq(risk, 1);
        assertTrue(fresh);
        vm.warp(block.timestamp + TTL);
        (, fresh) = registry.status(alice);
        assertTrue(fresh);
        vm.warp(block.timestamp + 1);
        (risk, fresh) = registry.status(alice);
        assertEq(risk, 1);
        assertFalse(fresh);
    }

    function test_ReScreeningRefreshesTheRecordAndCanChangeTheTier() public {
        vm.prank(screener);
        registry.setRisk(alice, 0, EVIDENCE);
        vm.warp(block.timestamp + TTL + 1);
        vm.prank(screener);
        registry.setRisk(alice, 2, keccak256("again"));
        (uint8 risk, bool fresh) = registry.status(alice);
        assertEq(risk, 2);
        assertTrue(fresh);
        (uint8 recordRisk, uint64 at, bytes32 evidence) = registry.recordOf(alice);
        assertEq(recordRisk, 2);
        assertEq(at, block.timestamp);
        assertEq(evidence, keccak256("again"));
    }

    function test_RejectsAnUnknownTier() public {
        vm.prank(screener);
        vm.expectRevert(ScreeningRegistry.InvalidRisk.selector);
        registry.setRisk(alice, 3, EVIDENCE);
    }

    function test_EmitsTheEvidenceOfEveryChange() public {
        vm.expectEmit(true, false, false, true, address(registry));
        emit ScreeningRegistry.RiskSet(alice, 2, uint64(block.timestamp), EVIDENCE);
        vm.prank(screener);
        registry.setRisk(alice, 2, EVIDENCE);
    }

    function test_BatchesAreBoundedAndConsistent() public {
        address[] memory who = new address[](200);
        uint8[] memory risks = new uint8[](200);
        for (uint256 i = 0; i < 200; i++) {
            who[i] = address(uint160(0x1000 + i));
            risks[i] = uint8(i % 3);
        }
        vm.prank(screener);
        registry.setRisks(who, risks, EVIDENCE);
        (uint8 risk,) = registry.status(address(uint160(0x1000 + 5)));
        assertEq(risk, 2);

        address[] memory big = new address[](201);
        uint8[] memory bigRisks = new uint8[](201);
        vm.prank(screener);
        vm.expectRevert(ScreeningRegistry.BatchTooLarge.selector);
        registry.setRisks(big, bigRisks, EVIDENCE);

        vm.prank(screener);
        vm.expectRevert(ScreeningRegistry.LengthMismatch.selector);
        registry.setRisks(who, new uint8[](3), EVIDENCE);
    }

    function test_TheOwnerManagesScreenersAndTheTtl() public {
        vm.prank(stranger);
        vm.expectRevert(ScreeningRegistry.NotOwner.selector);
        registry.setScreener(stranger, true);
        vm.prank(owner);
        registry.setScreener(screener, false);
        vm.prank(screener);
        vm.expectRevert(ScreeningRegistry.NotScreener.selector);
        registry.setRisk(alice, 0, EVIDENCE);
        vm.prank(owner);
        registry.setTtl(1 days);
        assertEq(registry.ttl(), 1 days);
        vm.prank(stranger);
        vm.expectRevert(ScreeningRegistry.NotOwner.selector);
        registry.setTtl(1);
    }

    function test_OwnershipMovesInTwoSteps() public {
        vm.prank(owner);
        registry.transferOwnership(stranger);
        assertEq(registry.owner(), owner);
        vm.prank(alice);
        vm.expectRevert(ScreeningRegistry.NotOwner.selector);
        registry.acceptOwnership();
        vm.prank(stranger);
        registry.acceptOwnership();
        assertEq(registry.owner(), stranger);
    }
}
