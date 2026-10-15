// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Test} from "forge-std/Test.sol";
import {BoxLedger} from "../../src/vault/BoxLedger.sol";
import {BoxVault} from "../../src/vault/BoxVault.sol";
import {BoxVaultFactory} from "../../src/vault/BoxVaultFactory.sol";
import {TestToken} from "../fixtures/TestToken.sol";

contract BoxLedgerTest is Test {
    uint8 internal constant TAXES = 1;
    uint8 internal constant PAYROLL = 2;
    uint8 internal constant SALARY = 3;
    uint8 internal constant OPERATING = 4;
    uint8 internal constant EMERGENCY = 5;
    uint8 internal constant PROFIT = 6;
    uint8 internal constant USDC = 1;
    uint8 internal constant EURC = 2;

    TestToken internal usdc;
    TestToken internal eurc;
    BoxVaultFactory internal factory;
    BoxVault internal vault;
    address internal owner = makeAddr("owner");
    address internal stranger = makeAddr("stranger");
    address internal payee = makeAddr("payee");
    address internal other = makeAddr("other");

    function setUp() public {
        vm.warp(1_900_000_000);
        usdc = new TestToken();
        eurc = new TestToken();
        factory = new BoxVaultFactory(address(new BoxVault(address(usdc), address(eurc))));
        vault = BoxVault(factory.create(owner));
        usdc.mint(address(vault), 10_000e6);
    }

    function _alloc(uint8 box, uint256 amount) internal {
        uint8[] memory boxes = new uint8[](1);
        uint256[] memory amounts = new uint256[](1);
        boxes[0] = box;
        amounts[0] = amount;
        vm.prank(owner);
        vault.allocate(USDC, boxes, amounts);
    }

    function _approve(uint8 box, address who) internal {
        vm.prank(owner);
        vault.approveRecipient(box, who);
        vm.warp(block.timestamp + 1 days + 1);
    }

    // ---- accounting

    function test_AFreshVaultSeesDepositsAsUnallocated() public view {
        assertEq(vault.unallocated(USDC), 10_000e6);
        assertEq(vault.unallocated(EURC), 0);
        assertEq(vault.owner(), owner);
    }

    function test_AllocateMovesUnallocatedFundsIntoBoxes() public {
        uint8[] memory boxes = new uint8[](3);
        uint256[] memory amounts = new uint256[](3);
        (boxes[0], amounts[0]) = (TAXES, 2_000e6);
        (boxes[1], amounts[1]) = (SALARY, 3_000e6);
        (boxes[2], amounts[2]) = (OPERATING, 1_000e6);
        vm.prank(owner);
        vault.allocate(USDC, boxes, amounts);
        assertEq(vault.boxBalance(USDC, TAXES), 2_000e6);
        assertEq(vault.boxBalance(USDC, SALARY), 3_000e6);
        assertEq(vault.unallocated(USDC), 4_000e6);
    }

    function test_AllocateRefusesMoreThanUnallocatedAndBadInput() public {
        uint8[] memory boxes = new uint8[](1);
        uint256[] memory amounts = new uint256[](1);
        boxes[0] = TAXES;
        amounts[0] = 10_000e6 + 1;
        vm.startPrank(owner);
        vm.expectRevert(BoxLedger.InsufficientUnallocated.selector);
        vault.allocate(USDC, boxes, amounts);
        amounts[0] = 1;
        boxes[0] = 7;
        vm.expectRevert(BoxLedger.UnknownBox.selector);
        vault.allocate(USDC, boxes, amounts);
        boxes[0] = 0;
        vm.expectRevert(BoxLedger.UnknownBox.selector);
        vault.allocate(USDC, boxes, amounts);
        boxes[0] = TAXES;
        vm.expectRevert(BoxLedger.UnknownAsset.selector);
        vault.allocate(3, boxes, amounts);
        vm.expectRevert(BoxLedger.LengthMismatch.selector);
        vault.allocate(USDC, boxes, new uint256[](2));
        vm.stopPrank();
    }

    function test_OnlyTheOwnerAllocatesAndWithdraws() public {
        uint8[] memory boxes = new uint8[](1);
        uint256[] memory amounts = new uint256[](1);
        vm.prank(stranger);
        vm.expectRevert(BoxLedger.NotOwner.selector);
        vault.allocate(USDC, boxes, amounts);
        vm.prank(stranger);
        vm.expectRevert(BoxLedger.NotOwner.selector);
        vault.withdraw(USDC, SALARY, 1, stranger);
        vm.prank(stranger);
        vm.expectRevert(BoxLedger.NotOwner.selector);
        vault.requestWithdrawal(USDC, SALARY, 1, stranger);
    }

    // ---- free boxes

    function test_SalaryOperatingAndProfitAreFree() public {
        _alloc(SALARY, 1_000e6);
        _alloc(OPERATING, 1_000e6);
        _alloc(PROFIT, 1_000e6);
        vm.startPrank(owner);
        vault.withdraw(USDC, SALARY, 400e6, payee);
        vault.withdraw(USDC, OPERATING, 1_000e6, payee);
        vault.withdraw(USDC, PROFIT, 1, payee);
        vm.stopPrank();
        assertEq(usdc.balanceOf(payee), 1_400e6 + 1);
        assertEq(vault.boxBalance(USDC, SALARY), 600e6);
        assertEq(vault.unallocated(USDC), 7_000e6);
    }

    function test_AWithdrawalCannotExceedTheBox() public {
        _alloc(SALARY, 100e6);
        vm.prank(owner);
        vm.expectRevert(BoxLedger.InsufficientBox.selector);
        vault.withdraw(USDC, SALARY, 100e6 + 1, payee);
    }

    function test_ZeroAmountsAreRefused() public {
        _alloc(SALARY, 100e6);
        vm.startPrank(owner);
        vm.expectRevert(BoxLedger.ZeroAmount.selector);
        vault.withdraw(USDC, SALARY, 0, payee);
        vm.expectRevert(BoxLedger.ZeroAmount.selector);
        vault.requestWithdrawal(USDC, SALARY, 0, payee);
        vm.stopPrank();
    }

    // ---- taxes: always 48 h

    function test_TaxesAlwaysWaitFortyEightHours() public {
        _alloc(TAXES, 1_000e6);
        vm.startPrank(owner);
        vm.expectRevert(BoxLedger.WaitRequired.selector);
        vault.withdraw(USDC, TAXES, 1, payee);
        uint256 id = vault.requestWithdrawal(USDC, TAXES, 500e6, payee);
        assertEq(vault.boxBalance(USDC, TAXES), 500e6);
        vm.expectRevert(BoxLedger.StillWaiting.selector);
        vault.executeWithdrawal(id);
        vm.warp(block.timestamp + 48 hours - 1);
        vm.expectRevert(BoxLedger.StillWaiting.selector);
        vault.executeWithdrawal(id);
        vm.warp(block.timestamp + 1);
        vault.executeWithdrawal(id);
        vm.stopPrank();
        assertEq(usdc.balanceOf(payee), 500e6);
        assertEq(vault.held(USDC), 500e6);
        assertEq(vault.unallocated(USDC), 9_000e6);
    }

    function test_ACancelledRequestReturnsTheFundsToTheBox() public {
        _alloc(TAXES, 1_000e6);
        vm.startPrank(owner);
        uint256 id = vault.requestWithdrawal(USDC, TAXES, 600e6, payee);
        assertEq(vault.boxBalance(USDC, TAXES), 400e6);
        vault.cancelWithdrawal(id);
        assertEq(vault.boxBalance(USDC, TAXES), 1_000e6);
        vm.expectRevert(BoxLedger.NoSuchRequest.selector);
        vault.executeWithdrawal(id);
        vm.expectRevert(BoxLedger.NoSuchRequest.selector);
        vault.cancelWithdrawal(id);
        vm.stopPrank();
    }

    function test_OnlyTheOwnerCancels() public {
        _alloc(TAXES, 1_000e6);
        vm.prank(owner);
        uint256 id = vault.requestWithdrawal(USDC, TAXES, 100e6, payee);
        vm.prank(stranger);
        vm.expectRevert(BoxLedger.NotOwner.selector);
        vault.cancelWithdrawal(id);
    }

    function test_ARequestCannotBeExecutedTwiceOrByAStranger() public {
        _alloc(TAXES, 1_000e6);
        vm.prank(owner);
        uint256 id = vault.requestWithdrawal(USDC, TAXES, 100e6, payee);
        vm.warp(block.timestamp + 48 hours);
        vm.prank(stranger);
        vm.expectRevert(BoxLedger.NotOwner.selector);
        vault.executeWithdrawal(id);
        vm.startPrank(owner);
        vault.executeWithdrawal(id);
        vm.expectRevert(BoxLedger.NoSuchRequest.selector);
        vault.executeWithdrawal(id);
        vm.stopPrank();
    }

    function test_AHardLockBlocksEverythingUntilTheDate() public {
        _alloc(TAXES, 1_000e6);
        BoxLedger.Rule memory rule = _rule(TAXES);
        rule.lockedUntil = uint64(block.timestamp + 30 days);
        vm.startPrank(owner);
        vault.setRule(TAXES, rule);
        vm.expectRevert(BoxLedger.HardLocked.selector);
        vault.requestWithdrawal(USDC, TAXES, 1, payee);
        vm.expectRevert(BoxLedger.HardLocked.selector);
        vault.withdraw(USDC, TAXES, 1, payee);
        vm.warp(block.timestamp + 30 days);
        uint256 id = vault.requestWithdrawal(USDC, TAXES, 1, payee);
        vm.stopPrank();
        assertEq(id, 0);
    }

    function test_AHardLockSetAfterARequestBlocksItsExecution() public {
        _alloc(TAXES, 1_000e6);
        vm.startPrank(owner);
        uint256 id = vault.requestWithdrawal(USDC, TAXES, 100e6, payee);
        BoxLedger.Rule memory rule = _rule(TAXES);
        rule.lockedUntil = uint64(block.timestamp + 60 days);
        vault.setRule(TAXES, rule);
        vm.warp(block.timestamp + 48 hours);
        vm.expectRevert(BoxLedger.HardLocked.selector);
        vault.executeWithdrawal(id);
        vm.stopPrank();
    }

    // ---- emergency fund: 24 h

    function test_TheEmergencyFundWaitsTwentyFourHours() public {
        _alloc(EMERGENCY, 1_000e6);
        vm.startPrank(owner);
        vm.expectRevert(BoxLedger.WaitRequired.selector);
        vault.withdraw(USDC, EMERGENCY, 1, payee);
        uint256 id = vault.requestWithdrawal(USDC, EMERGENCY, 1_000e6, payee);
        vm.warp(block.timestamp + 24 hours - 1);
        vm.expectRevert(BoxLedger.StillWaiting.selector);
        vault.executeWithdrawal(id);
        vm.warp(block.timestamp + 1);
        vault.executeWithdrawal(id);
        vm.stopPrank();
        assertEq(usdc.balanceOf(payee), 1_000e6);
    }

    // ---- payroll: approved recipients only, others wait 24 h

    function test_PayrollPaysApprovedRecipientsAtOnceAndOthersAfterAWait() public {
        _alloc(PAYROLL, 1_000e6);
        vm.startPrank(owner);
        vm.expectRevert(BoxLedger.WaitRequired.selector);
        vault.withdraw(USDC, PAYROLL, 100e6, payee);
        vault.approveRecipient(PAYROLL, payee);
        vm.expectRevert(BoxLedger.WaitRequired.selector);
        vault.withdraw(USDC, PAYROLL, 100e6, payee);
        vm.stopPrank();
        vm.warp(block.timestamp + 1 days + 1);
        vm.startPrank(owner);
        vault.withdraw(USDC, PAYROLL, 100e6, payee);
        vm.expectRevert(BoxLedger.WaitRequired.selector);
        vault.withdraw(USDC, PAYROLL, 100e6, other);
        uint256 id = vault.requestWithdrawal(USDC, PAYROLL, 100e6, other);
        vm.warp(block.timestamp + 24 hours);
        vault.executeWithdrawal(id);
        vm.stopPrank();
        assertEq(usdc.balanceOf(payee), 100e6);
        assertEq(usdc.balanceOf(other), 100e6);
    }

    function test_AnApprovalTakesEffectAfterTheWaitAndRevocationIsImmediate() public {
        vm.prank(owner);
        vault.approveRecipient(PAYROLL, payee);
        assertFalse(vault.isApproved(PAYROLL, payee));
        vm.warp(block.timestamp + 1 days - 1);
        assertFalse(vault.isApproved(PAYROLL, payee));
        vm.warp(block.timestamp + 1);
        assertTrue(vault.isApproved(PAYROLL, payee));
        vm.prank(owner);
        vault.revokeRecipient(PAYROLL, payee);
        assertFalse(vault.isApproved(PAYROLL, payee));
    }

    // ---- operating floor

    function test_LeavingABoxBelowItsFloorNeedsTheWait() public {
        _alloc(OPERATING, 1_000e6);
        BoxLedger.Rule memory rule = _rule(OPERATING);
        rule.floor = 600e6;
        rule.delay = 24 hours;
        vm.startPrank(owner);
        vault.setRule(OPERATING, rule);
        vault.withdraw(USDC, OPERATING, 400e6, payee);
        vm.expectRevert(BoxLedger.WaitRequired.selector);
        vault.withdraw(USDC, OPERATING, 1, payee);
        uint256 id = vault.requestWithdrawal(USDC, OPERATING, 100e6, payee);
        vm.warp(block.timestamp + 24 hours);
        vault.executeWithdrawal(id);
        vm.stopPrank();
        assertEq(vault.boxBalance(USDC, OPERATING), 500e6);
    }

    // ---- rule changes

    function test_TighteningAppliesAtOnce() public {
        BoxLedger.Rule memory rule = _rule(SALARY);
        rule.delay = 12 hours;
        rule.alwaysDelayed = true;
        vm.prank(owner);
        vault.setRule(SALARY, rule);
        assertEq(_rule(SALARY).delay, 12 hours);
        assertTrue(_rule(SALARY).alwaysDelayed);
    }

    function test_LooseningWaitsAndCanBeCancelled() public {
        BoxLedger.Rule memory rule = _rule(TAXES);
        rule.alwaysDelayed = false;
        rule.delay = 0;
        vm.startPrank(owner);
        vault.setRule(TAXES, rule);
        assertTrue(_rule(TAXES).alwaysDelayed);
        vm.expectRevert(BoxLedger.StillWaiting.selector);
        vault.applyRuleChange(TAXES);
        vm.warp(block.timestamp + 48 hours - 1);
        vm.expectRevert(BoxLedger.StillWaiting.selector);
        vault.applyRuleChange(TAXES);
        vm.warp(block.timestamp + 1);
        vault.applyRuleChange(TAXES);
        vm.stopPrank();
        assertFalse(_rule(TAXES).alwaysDelayed);
        assertEq(_rule(TAXES).delay, 0);

        BoxLedger.Rule memory strict = _rule(TAXES);
        strict.restricted = false;
        vm.startPrank(owner);
        vault.setRule(PAYROLL, _looserPayroll());
        vault.cancelRuleChange(PAYROLL);
        vm.warp(block.timestamp + 5 days);
        vm.expectRevert(BoxLedger.NoPendingChange.selector);
        vault.applyRuleChange(PAYROLL);
        vm.stopPrank();
        assertTrue(_rule(PAYROLL).restricted);
    }

    function test_ShorteningTheDelayOrTheHardLockIsALooseningToo() public {
        BoxLedger.Rule memory shorter = _rule(TAXES);
        shorter.delay = 1 hours;
        vm.prank(owner);
        vault.setRule(TAXES, shorter);
        assertEq(_rule(TAXES).delay, 48 hours);

        BoxLedger.Rule memory locked = _rule(TAXES);
        locked.lockedUntil = uint64(block.timestamp + 30 days);
        vm.prank(owner);
        vault.setRule(TAXES, locked);
        assertEq(_rule(TAXES).lockedUntil, locked.lockedUntil);

        BoxLedger.Rule memory unlocked = _rule(TAXES);
        unlocked.lockedUntil = 0;
        vm.prank(owner);
        vault.setRule(TAXES, unlocked);
        assertEq(_rule(TAXES).lockedUntil, locked.lockedUntil);

        BoxLedger.Rule memory lowerFloor = _rule(OPERATING);
        lowerFloor.floor = 500e6;
        vm.startPrank(owner);
        vault.setRule(OPERATING, lowerFloor);
        lowerFloor.floor = 100e6;
        vault.setRule(OPERATING, lowerFloor);
        vm.stopPrank();
        (,,, uint128 floor,) = vault.rules(OPERATING);
        assertEq(floor, 500e6);
    }

    function test_ALooseningCannotBeRushedThroughAnotherChange() public {
        vm.startPrank(owner);
        vault.setRule(TAXES, _looserTaxes());
        BoxLedger.Rule memory stricter = _rule(TAXES);
        stricter.delay = 72 hours;
        vault.setRule(TAXES, stricter);
        assertEq(_rule(TAXES).delay, 72 hours);
        vm.expectRevert(BoxLedger.NoPendingChange.selector);
        vault.applyRuleChange(TAXES);
        vm.stopPrank();
    }

    function test_ThePendingLooseningWaitsForTheCurrentDelayNotTheNewOne() public {
        vm.startPrank(owner);
        vault.setRule(EMERGENCY, _looserEmergency());
        vm.warp(block.timestamp + 24 hours - 1);
        vm.expectRevert(BoxLedger.StillWaiting.selector);
        vault.applyRuleChange(EMERGENCY);
        vm.warp(block.timestamp + 1);
        vault.applyRuleChange(EMERGENCY);
        vm.stopPrank();
        assertFalse(_rule(EMERGENCY).alwaysDelayed);
    }

    function test_FreeBoxesStillWaitAtLeastADayToLoosenOrApprove() public {
        BoxLedger.Rule memory rule = _rule(SALARY);
        rule.restricted = true;
        vm.startPrank(owner);
        vault.setRule(SALARY, rule);
        rule.restricted = false;
        vault.setRule(SALARY, rule);
        vm.warp(block.timestamp + 1 days - 1);
        vm.expectRevert(BoxLedger.StillWaiting.selector);
        vault.applyRuleChange(SALARY);
        vm.stopPrank();
    }

    // ---- ownership

    function test_OwnershipMovesInTwoSteps() public {
        vm.prank(owner);
        vault.transferOwnership(other);
        assertEq(vault.owner(), owner);
        vm.prank(stranger);
        vm.expectRevert(BoxLedger.NotOwner.selector);
        vault.acceptOwnership();
        vm.prank(other);
        vault.acceptOwnership();
        assertEq(vault.owner(), other);
    }

    // ---- receipts

    function test_EveryMovementEmitsAReceipt() public {
        uint8[] memory boxes = new uint8[](1);
        uint256[] memory amounts = new uint256[](1);
        boxes[0] = SALARY;
        amounts[0] = 100e6;
        vm.expectEmit(true, true, false, true, address(vault));
        emit BoxLedger.Allocated(USDC, SALARY, 100e6, 100e6);
        vm.prank(owner);
        vault.allocate(USDC, boxes, amounts);
        vm.expectEmit(true, true, true, true, address(vault));
        emit BoxLedger.Withdrawn(USDC, SALARY, payee, 40e6, 60e6);
        vm.prank(owner);
        vault.withdraw(USDC, SALARY, 40e6, payee);
    }

    // ---- clones

    function test_TheFactoryGivesOneDeterministicVaultPerOwner() public {
        assertEq(factory.vaultOf(owner), address(vault));
        assertEq(factory.predict(owner), address(vault));
        vm.expectRevert(BoxVaultFactory.AlreadyCreated.selector);
        factory.create(owner);
        address predicted = factory.predict(other);
        assertEq(factory.create(other), predicted);
        assertTrue(predicted != address(vault));
    }

    function test_AVaultCannotBeInitialisedTwiceNorTheImplementation() public {
        vm.expectRevert(BoxLedger.AlreadyInitialised.selector);
        vault.initialize(stranger);
        BoxVault implementation = BoxVault(factory.implementation());
        vm.expectRevert(BoxLedger.AlreadyInitialised.selector);
        implementation.initialize(stranger);
    }

    function test_TheDefaultRulesFollowTheProductDecisions() public view {
        assertEq(_rule(TAXES).delay, 48 hours);
        assertTrue(_rule(TAXES).alwaysDelayed);
        assertEq(_rule(PAYROLL).delay, 24 hours);
        assertTrue(_rule(PAYROLL).restricted);
        assertEq(_rule(EMERGENCY).delay, 24 hours);
        assertTrue(_rule(EMERGENCY).alwaysDelayed);
        assertEq(_rule(SALARY).delay, 0);
        assertFalse(_rule(OPERATING).alwaysDelayed);
        assertFalse(_rule(PROFIT).restricted);
    }

    // ---- helpers

    function _rule(uint8 box) internal view returns (BoxLedger.Rule memory rule) {
        (uint32 delay, bool alwaysDelayed, bool restricted, uint128 floor, uint64 lockedUntil) = vault.rules(box);
        rule = BoxLedger.Rule(delay, alwaysDelayed, restricted, floor, lockedUntil);
    }

    function _looserTaxes() internal view returns (BoxLedger.Rule memory rule) {
        rule = _rule(TAXES);
        rule.alwaysDelayed = false;
    }

    function _looserPayroll() internal view returns (BoxLedger.Rule memory rule) {
        rule = _rule(PAYROLL);
        rule.restricted = false;
    }

    function _looserEmergency() internal view returns (BoxLedger.Rule memory rule) {
        rule = _rule(EMERGENCY);
        rule.alwaysDelayed = false;
        rule.delay = 0;
    }
}
