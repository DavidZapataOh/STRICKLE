// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Test} from "forge-std/Test.sol";
import {ShieldVerifier} from "../../src/pool/verifiers/ShieldVerifier.sol";
import {SpendVerifier} from "../../src/pool/verifiers/SpendVerifier.sol";
import {IHonkVerifier} from "../../src/pool/IHonkVerifier.sol";
import {IPoseidon2, Poseidon2Hasher} from "../../src/pool/Poseidon2Hasher.sol";
import {PolicyPool} from "../../src/pool/PolicyPool.sol";
import {TestToken} from "../fixtures/TestToken.sol";

contract PolicyPoolHarness is PolicyPool {
    constructor(Config memory config) PolicyPool(config) {}

    function setTotalShielded(uint8 asset, uint256 value) external {
        totalShielded[asset] = value;
    }
}

contract PolicyPoolTest is Test {
    PolicyPoolHarness internal pool;
    TestToken internal usdc;
    TestToken internal eurc;
    address internal owner = makeAddr("owner");
    address internal guardian = makeAddr("guardian");
    address internal alice = makeAddr("alice");

    function setUp() public {
        usdc = new TestToken();
        eurc = new TestToken();
        pool = new PolicyPoolHarness(
            PolicyPool.Config({
                hasher: IPoseidon2(address(new Poseidon2Hasher())),
                usdc: address(usdc),
                eurc: address(eurc),
                shieldVerifier: IHonkVerifier(address(new ShieldVerifier())),
                spendVerifier: IHonkVerifier(address(new SpendVerifier())),
                owner: owner,
                guardian: guardian,
                perUserCaps: [uint128(1_000e6), uint128(500e6)],
                globalCaps: [uint128(10_000e6), uint128(5_000e6)]
            })
        );
        usdc.mint(alice, 50_000e6);
        vm.prank(alice);
        usdc.approve(address(pool), type(uint256).max);
    }

    function test_StartsWithTheConfiguredCapsAndRoles() public view {
        (uint128 perUser, uint128 global) = pool.caps(1);
        assertEq(perUser, 1_000e6);
        assertEq(global, 10_000e6);
        (perUser, global) = pool.caps(2);
        assertEq(perUser, 500e6);
        assertEq(global, 5_000e6);
        assertEq(pool.owner(), owner);
        assertEq(pool.guardian(), guardian);
        assertFalse(pool.paused());
    }

    function test_ShieldRejectsUnknownAssetsZeroAndHugeAmounts() public {
        vm.startPrank(alice);
        vm.expectRevert(PolicyPool.UnknownAsset.selector);
        pool.shield(3, 1e6, 1, "", "");
        vm.expectRevert(PolicyPool.ZeroAmount.selector);
        pool.shield(1, 0, 1, "", "");
        vm.expectRevert(PolicyPool.AmountTooLarge.selector);
        pool.shield(1, uint256(type(uint64).max) + 1, 1, "", "");
        vm.stopPrank();
    }

    function test_ShieldRejectsAnOversizedCiphertext() public {
        vm.prank(alice);
        vm.expectRevert(PolicyPool.CiphertextTooLarge.selector);
        pool.shield(1, 1e6, 1, "", new bytes(2049));
    }

    function test_ShieldEnforcesThePerUserCap() public {
        vm.prank(alice);
        vm.expectRevert(PolicyPool.UserCapExceeded.selector);
        pool.shield(1, 1_000e6 + 1, 1, "", "");
    }

    function test_ShieldEnforcesTheGlobalCap() public {
        pool.setTotalShielded(1, 9_800e6);
        vm.prank(alice);
        vm.expectRevert(PolicyPool.GlobalCapExceeded.selector);
        pool.shield(1, 201e6, 1, "", "");
    }

    function test_OnlyTheOwnerCanLowerCapsAndOnlyDownwards() public {
        vm.prank(alice);
        vm.expectRevert(PolicyPool.NotOwner.selector);
        pool.lowerCaps(1, 1, 1);
        vm.startPrank(owner);
        vm.expectRevert(PolicyPool.CapsCanOnlyDecrease.selector);
        pool.lowerCaps(1, 1_000e6 + 1, 10_000e6);
        vm.expectRevert(PolicyPool.CapsCanOnlyDecrease.selector);
        pool.lowerCaps(1, 1_000e6, 10_000e6 + 1);
        pool.lowerCaps(1, 400e6, 5_000e6);
        vm.stopPrank();
        (uint128 perUser, uint128 global) = pool.caps(1);
        assertEq(perUser, 400e6);
        assertEq(global, 5_000e6);
    }

    function test_TheGuardianCanPauseButOnlyTheOwnerCanUnpause() public {
        vm.prank(alice);
        vm.expectRevert(PolicyPool.NotGuardian.selector);
        pool.pause();
        vm.prank(guardian);
        pool.pause();
        assertTrue(pool.paused());
        vm.prank(alice);
        vm.expectRevert(PolicyPool.PoolPaused.selector);
        pool.shield(1, 1e6, 1, "", "");
        vm.prank(guardian);
        vm.expectRevert(PolicyPool.NotOwner.selector);
        pool.unpause();
        vm.prank(owner);
        pool.unpause();
        assertFalse(pool.paused());
    }

    function test_OwnershipMovesInTwoSteps() public {
        address next = makeAddr("next");
        vm.prank(owner);
        pool.transferOwnership(next);
        assertEq(pool.owner(), owner);
        vm.prank(alice);
        vm.expectRevert(PolicyPool.NotOwner.selector);
        pool.acceptOwnership();
        vm.prank(next);
        pool.acceptOwnership();
        assertEq(pool.owner(), next);
    }

    function test_SpendRejectsStaleTimeUnknownRootAndUnknownAssociationRoot() public {
        vm.warp(1_000_000);
        PolicyPool.SpendInputs memory p;
        p.root = pool.currentRoot();
        p.asset = 1;
        p.timestamp = uint64(block.timestamp - 601);
        vm.expectRevert(PolicyPool.StaleTimestamp.selector);
        pool.spend("", p, "");
        p.timestamp = uint64(block.timestamp + 1);
        vm.expectRevert(PolicyPool.StaleTimestamp.selector);
        pool.spend("", p, "");
        p.timestamp = uint64(block.timestamp);
        p.root = 12345;
        vm.expectRevert(PolicyPool.UnknownRoot.selector);
        pool.spend("", p, "");
        p.root = pool.currentRoot();
        p.associationRoot = 777;
        vm.expectRevert(PolicyPool.UnknownAssociationRoot.selector);
        pool.spend("", p, "");
    }

    function test_SpendRejectsAnUnknownAssetAndABadRecipient() public {
        PolicyPool.SpendInputs memory p;
        p.root = pool.currentRoot();
        p.timestamp = uint64(block.timestamp);
        p.asset = 9;
        vm.expectRevert(PolicyPool.UnknownAsset.selector);
        pool.spend("", p, "");
        p.asset = 1;
        p.publicAmount = 1;
        p.recipient = 0;
        vm.expectRevert(PolicyPool.InvalidRecipient.selector);
        pool.spend("", p, "");
        p.recipient = uint256(uint160(address(pool)));
        vm.expectRevert(PolicyPool.InvalidRecipient.selector);
        pool.spend("", p, "");
        p.recipient = uint256(1) << 160;
        vm.expectRevert(PolicyPool.InvalidRecipient.selector);
        pool.spend("", p, "");
    }

    function test_AGarbageProofIsReportedAsInvalid() public {
        PolicyPool.SpendInputs memory p;
        p.root = pool.currentRoot();
        p.asset = 1;
        p.timestamp = uint64(block.timestamp);
        p.nullifiers = [uint256(1), uint256(2)];
        p.commitments = [uint256(3), uint256(4)];
        vm.expectRevert(PolicyPool.InvalidProof.selector);
        pool.spend(hex"deadbeef", p, "");
    }

    function test_TheGuardianAndAssociationRootsAreOwnerManaged() public {
        vm.prank(alice);
        vm.expectRevert(PolicyPool.NotOwner.selector);
        pool.setGuardian(alice);
        vm.startPrank(owner);
        pool.setGuardian(alice);
        pool.setAssociationRoot(99, true);
        vm.stopPrank();
        assertEq(pool.guardian(), alice);
        assertTrue(pool.approvedAssociationRoot(99));
    }
}
