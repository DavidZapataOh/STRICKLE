// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Test} from "forge-std/Test.sol";
import {BoxLedger} from "../../src/vault/BoxLedger.sol";
import {BoxVault} from "../../src/vault/BoxVault.sol";
import {BoxVaultFactory} from "../../src/vault/BoxVaultFactory.sol";
import {TestToken} from "../fixtures/TestToken.sol";
import {TestVault4626} from "../fixtures/TestVault4626.sol";
import {Vaults} from "../fixtures/Vaults.sol";

contract BoxVaultAgentTest is Test {
    uint8 internal constant TAXES = 1;
    uint8 internal constant PAYROLL = 2;
    uint8 internal constant SALARY = 3;
    uint8 internal constant OPERATING = 4;
    uint8 internal constant EMERGENCY = 5;
    uint8 internal constant PROFIT = 6;
    uint8 internal constant USDC = 1;

    TestToken internal usdc;
    TestToken internal eurc;
    BoxVault internal vault;
    TestVault4626 internal yield;
    address internal owner = makeAddr("owner");
    address internal agent = makeAddr("agent");
    address internal stranger = makeAddr("stranger");
    address internal taxOffice = makeAddr("taxOffice");
    address internal supplier = makeAddr("supplier");

    function setUp() public {
        vm.warp(1_900_000_000);
        usdc = new TestToken();
        eurc = new TestToken();
        BoxVaultFactory factory = new BoxVaultFactory(address(Vaults.newVault(usdc, eurc)));
        vault = BoxVault(factory.create(owner));
        yield = new TestVault4626(usdc);
        usdc.mint(address(vault), 10_000e6);

        vm.startPrank(owner);
        vault.setAgent(agent, 1_000e6, 1 days);
        vault.approveRecipient(TAXES, taxOffice);
        vault.approveRecipient(PAYROLL, supplier);
        vault.approveVault(address(yield));
        vm.stopPrank();
        vm.warp(block.timestamp + 2 days);
    }

    function _split(uint8 box, uint256 amount) internal {
        uint8[] memory boxes = new uint8[](1);
        uint256[] memory amounts = new uint256[](1);
        boxes[0] = box;
        amounts[0] = amount;
        vm.prank(agent);
        vault.split(USDC, boxes, amounts);
    }

    // ---- role matrix

    function test_OnlyTheAgentRunsAgentFunctions() public {
        uint8[] memory boxes = new uint8[](1);
        uint256[] memory amounts = new uint256[](1);
        vm.startPrank(stranger);
        vm.expectRevert(BoxVault.NotAgent.selector);
        vault.split(USDC, boxes, amounts);
        vm.expectRevert(BoxVault.NotAgent.selector);
        vault.payAllowlisted(USDC, TAXES, taxOffice, 1);
        vm.expectRevert(BoxVault.NotAgent.selector);
        vault.proposeLargePayment(USDC, TAXES, taxOffice, 1, bytes32(0));
        vm.expectRevert(BoxVault.NotAgent.selector);
        vault.sweepToVault(USDC, SALARY, address(yield), 1);
        vm.stopPrank();
        vm.prank(owner);
        vm.expectRevert(BoxVault.NotAgent.selector);
        vault.split(USDC, boxes, amounts);
    }

    function test_TheAgentCannotTouchRulesRecipientsVaultsOrOwnership() public {
        BoxLedger.Rule memory rule = BoxLedger.Rule(0, false, false, 0, 0);
        vm.startPrank(agent);
        vm.expectRevert(BoxLedger.NotOwner.selector);
        vault.setRule(TAXES, rule);
        vm.expectRevert(BoxLedger.NotOwner.selector);
        vault.approveRecipient(SALARY, agent);
        vm.expectRevert(BoxLedger.NotOwner.selector);
        vault.approveVault(stranger);
        vm.expectRevert(BoxLedger.NotOwner.selector);
        vault.setAgent(stranger, type(uint128).max, 1);
        vm.expectRevert(BoxLedger.NotOwner.selector);
        vault.transferOwnership(agent);
        vm.expectRevert(BoxLedger.NotOwner.selector);
        vault.withdraw(USDC, SALARY, 1, agent);
        vm.expectRevert(BoxLedger.NotOwner.selector);
        vault.requestWithdrawal(USDC, SALARY, 1, agent);
        vm.stopPrank();
    }

    // ---- split

    function test_TheAgentSplitsUnallocatedFundsIntoBoxes() public {
        uint8[] memory boxes = new uint8[](3);
        uint256[] memory amounts = new uint256[](3);
        (boxes[0], amounts[0]) = (TAXES, 2_000e6);
        (boxes[1], amounts[1]) = (SALARY, 1_000e6);
        (boxes[2], amounts[2]) = (OPERATING, 500e6);
        vm.prank(agent);
        vault.split(USDC, boxes, amounts);
        assertEq(vault.boxBalance(USDC, TAXES), 2_000e6);
        assertEq(vault.unallocated(USDC), 6_500e6);
    }

    function test_ASplitCannotUseMoreThanWhatArrived() public {
        uint8[] memory boxes = new uint8[](1);
        uint256[] memory amounts = new uint256[](1);
        boxes[0] = TAXES;
        amounts[0] = 10_000e6 + 1;
        vm.prank(agent);
        vm.expectRevert(BoxLedger.InsufficientUnallocated.selector);
        vault.split(USDC, boxes, amounts);
    }

    // ---- paying allowlisted recipients

    function test_TheAgentPaysApprovedRecipientsWithinTheCap() public {
        _split(TAXES, 2_000e6);
        _split(PAYROLL, 2_000e6);
        vm.startPrank(agent);
        vault.payAllowlisted(USDC, TAXES, taxOffice, 600e6);
        vault.payAllowlisted(USDC, PAYROLL, supplier, 400e6);
        vm.stopPrank();
        assertEq(usdc.balanceOf(taxOffice), 600e6);
        assertEq(usdc.balanceOf(supplier), 400e6);
        assertEq(vault.boxBalance(USDC, TAXES), 1_400e6);
    }

    function test_TheAgentNeverPaysAnUnapprovedOrNotYetApprovedAddress() public {
        _split(SALARY, 2_000e6);
        _split(TAXES, 100e6);
        vm.prank(agent);
        vm.expectRevert(BoxVault.RecipientNotApproved.selector);
        vault.payAllowlisted(USDC, SALARY, stranger, 1);
        vm.prank(owner);
        vault.approveRecipient(SALARY, stranger);
        vm.prank(agent);
        vm.expectRevert(BoxVault.RecipientNotApproved.selector);
        vault.payAllowlisted(USDC, SALARY, stranger, 1);
        vm.warp(block.timestamp + 1 days);
        vm.prank(agent);
        vault.payAllowlisted(USDC, SALARY, stranger, 1);
        // approval is per box
        vm.prank(agent);
        vm.expectRevert(BoxVault.RecipientNotApproved.selector);
        vault.payAllowlisted(USDC, TAXES, stranger, 1);
    }

    function test_ARevokedRecipientCannotBePaidAnymore() public {
        _split(TAXES, 1_000e6);
        vm.prank(owner);
        vault.revokeRecipient(TAXES, taxOffice);
        vm.prank(agent);
        vm.expectRevert(BoxVault.RecipientNotApproved.selector);
        vault.payAllowlisted(USDC, TAXES, taxOffice, 1);
    }

    function test_TheCapIsRollingPerWindow() public {
        _split(TAXES, 5_000e6);
        vm.startPrank(agent);
        vault.payAllowlisted(USDC, TAXES, taxOffice, 700e6);
        vault.payAllowlisted(USDC, TAXES, taxOffice, 300e6);
        vm.expectRevert(BoxVault.CapExceeded.selector);
        vault.payAllowlisted(USDC, TAXES, taxOffice, 1);
        vm.warp(block.timestamp + 1 days - 1);
        vm.expectRevert(BoxVault.CapExceeded.selector);
        vault.payAllowlisted(USDC, TAXES, taxOffice, 1);
        vm.warp(block.timestamp + 1);
        vault.payAllowlisted(USDC, TAXES, taxOffice, 1_000e6);
        vm.expectRevert(BoxVault.CapExceeded.selector);
        vault.payAllowlisted(USDC, TAXES, taxOffice, 1);
        vm.stopPrank();
    }

    function test_APaymentAboveTheCapInOneGoIsRefused() public {
        _split(TAXES, 5_000e6);
        vm.prank(agent);
        vm.expectRevert(BoxVault.CapExceeded.selector);
        vault.payAllowlisted(USDC, TAXES, taxOffice, 1_000e6 + 1);
    }

    function test_TheAgentNeverLeavesABoxBelowItsFloor() public {
        _split(PAYROLL, 1_000e6);
        BoxLedger.Rule memory rule = BoxLedger.Rule(24 hours, false, true, 700e6, 0);
        vm.prank(owner);
        vault.setRule(PAYROLL, rule);
        vm.startPrank(agent);
        vault.payAllowlisted(USDC, PAYROLL, supplier, 300e6);
        vm.expectRevert(BoxVault.BelowFloor.selector);
        vault.payAllowlisted(USDC, PAYROLL, supplier, 1);
        vm.stopPrank();
    }

    function test_TheAgentCanPayTaxesDuringAHardLockToAnApprovedAuthority() public {
        _split(TAXES, 1_000e6);
        BoxLedger.Rule memory rule = BoxLedger.Rule(48 hours, true, false, 0, uint64(block.timestamp + 30 days));
        vm.prank(owner);
        vault.setRule(TAXES, rule);
        vm.prank(agent);
        vault.payAllowlisted(USDC, TAXES, taxOffice, 500e6);
        assertEq(usdc.balanceOf(taxOffice), 500e6);
    }

    function test_AnAgentPaymentCannotExceedTheBox() public {
        _split(TAXES, 100e6);
        vm.prank(agent);
        vm.expectRevert(BoxLedger.InsufficientBox.selector);
        vault.payAllowlisted(USDC, TAXES, taxOffice, 100e6 + 1);
        vm.prank(agent);
        vm.expectRevert(BoxLedger.ZeroAmount.selector);
        vault.payAllowlisted(USDC, TAXES, taxOffice, 0);
    }

    // ---- large payments

    function test_ALargePaymentWaitsForTheOwnersApproval() public {
        _split(PROFIT, 5_000e6);
        vm.prank(owner);
        vault.approveRecipient(PROFIT, supplier);
        vm.prank(agent);
        uint256 id = vault.proposeLargePayment(USDC, PROFIT, supplier, 4_000e6, keccak256("invoice 42"));
        assertEq(usdc.balanceOf(supplier), 0);
        vm.prank(agent);
        vm.expectRevert(BoxLedger.NotOwner.selector);
        vault.approveProposal(id);
        vm.warp(block.timestamp + 1 days);
        vm.prank(owner);
        vault.approveProposal(id);
        assertEq(usdc.balanceOf(supplier), 4_000e6);
        vm.prank(owner);
        vm.expectRevert(BoxVault.NoSuchProposal.selector);
        vault.approveProposal(id);
    }

    function test_AnApprovedProposalFromAWaitingBoxBecomesARequest() public {
        _split(TAXES, 5_000e6);
        vm.prank(agent);
        uint256 id = vault.proposeLargePayment(USDC, TAXES, supplier, 2_000e6, bytes32(0));
        vm.prank(owner);
        vault.approveProposal(id);
        assertEq(usdc.balanceOf(supplier), 0);
        assertEq(vault.boxBalance(USDC, TAXES), 3_000e6);
        vm.warp(block.timestamp + 48 hours);
        vm.prank(owner);
        vault.executeWithdrawal(0);
        assertEq(usdc.balanceOf(supplier), 2_000e6);
    }

    function test_ProposalsCanBeRejectedAndExpire() public {
        _split(SALARY, 5_000e6);
        vm.prank(agent);
        uint256 first = vault.proposeLargePayment(USDC, SALARY, supplier, 100e6, bytes32(0));
        vm.prank(agent);
        uint256 second = vault.proposeLargePayment(USDC, SALARY, supplier, 100e6, bytes32(0));
        vm.prank(owner);
        vault.rejectProposal(first);
        vm.prank(owner);
        vm.expectRevert(BoxVault.NoSuchProposal.selector);
        vault.approveProposal(first);
        vm.warp(block.timestamp + 7 days + 1);
        vm.prank(owner);
        vm.expectRevert(BoxVault.ProposalExpired.selector);
        vault.approveProposal(second);
    }

    // ---- pause and revoke

    function test_PausingStopsEveryAgentActionAtOnce() public {
        _split(TAXES, 1_000e6);
        vm.prank(owner);
        vault.pauseAgent();
        uint8[] memory boxes = new uint8[](1);
        uint256[] memory amounts = new uint256[](1);
        vm.startPrank(agent);
        vm.expectRevert(BoxVault.AgentIsPaused.selector);
        vault.split(USDC, boxes, amounts);
        vm.expectRevert(BoxVault.AgentIsPaused.selector);
        vault.payAllowlisted(USDC, TAXES, taxOffice, 1);
        vm.expectRevert(BoxVault.AgentIsPaused.selector);
        vault.proposeLargePayment(USDC, TAXES, taxOffice, 1, bytes32(0));
        vm.expectRevert(BoxVault.AgentIsPaused.selector);
        vault.sweepToVault(USDC, TAXES, address(yield), 1);
        vm.expectRevert(BoxVault.AgentIsPaused.selector);
        vault.redeem(USDC, TAXES, address(yield), 1);
        vm.stopPrank();
        vm.prank(owner);
        vault.resumeAgent();
        vm.prank(agent);
        vault.payAllowlisted(USDC, TAXES, taxOffice, 1);
    }

    function test_OnlyTheOwnerPausesResumesAndRevokes() public {
        vm.startPrank(agent);
        vm.expectRevert(BoxLedger.NotOwner.selector);
        vault.pauseAgent();
        vm.expectRevert(BoxLedger.NotOwner.selector);
        vault.resumeAgent();
        vm.expectRevert(BoxLedger.NotOwner.selector);
        vault.revokeAgent();
        vm.stopPrank();
    }

    function test_RevokingTheAgentEndsItsRole() public {
        _split(TAXES, 1_000e6);
        vm.prank(owner);
        vault.revokeAgent();
        assertEq(vault.agent(), address(0));
        vm.prank(agent);
        vm.expectRevert(BoxVault.NotAgent.selector);
        vault.payAllowlisted(USDC, TAXES, taxOffice, 1);
    }

    function test_ReplacingTheAgentResetsTheCapWindow() public {
        _split(TAXES, 5_000e6);
        vm.prank(agent);
        vault.payAllowlisted(USDC, TAXES, taxOffice, 1_000e6);
        address next = makeAddr("next");
        vm.prank(owner);
        vault.setAgent(next, 500e6, 1 days);
        vm.prank(agent);
        vm.expectRevert(BoxVault.NotAgent.selector);
        vault.payAllowlisted(USDC, TAXES, taxOffice, 1);
        vm.prank(next);
        vault.payAllowlisted(USDC, TAXES, taxOffice, 500e6);
        vm.prank(next);
        vm.expectRevert(BoxVault.CapExceeded.selector);
        vault.payAllowlisted(USDC, TAXES, taxOffice, 1);
    }

    // ---- yield vaults

    function test_TheAgentSweepsIntoAnApprovedVaultAndRedeemsBack() public {
        _split(PROFIT, 2_000e6);
        vm.prank(agent);
        vault.sweepToVault(USDC, PROFIT, address(yield), 1_500e6);
        assertEq(vault.boxBalance(USDC, PROFIT), 500e6);
        assertEq(vault.invested(USDC, PROFIT), 1_500e6);
        assertEq(vault.unallocated(USDC), 8_000e6);
        yield.donate(150e6);
        uint256 shares = vault.sharesOf(address(yield), PROFIT);
        vm.prank(agent);
        vault.redeem(USDC, PROFIT, address(yield), shares);
        assertEq(vault.boxBalance(USDC, PROFIT), 500e6 + 1_650e6);
        assertEq(vault.invested(USDC, PROFIT), 0);
        assertEq(vault.sharesOf(address(yield), PROFIT), 0);
    }

    function test_ALossOnRedeemShowsUpInTheBoxAndNeverBreaksTheBooks() public {
        _split(PROFIT, 2_000e6);
        vm.prank(agent);
        vault.sweepToVault(USDC, PROFIT, address(yield), 2_000e6);
        yield.slash(500e6);
        uint256 shares = vault.sharesOf(address(yield), PROFIT);
        vm.prank(agent);
        vault.redeem(USDC, PROFIT, address(yield), shares / 2);
        assertEq(vault.boxBalance(USDC, PROFIT), 750e6);
        assertEq(vault.invested(USDC, PROFIT), 1_000e6);
        assertGe(usdc.balanceOf(address(vault)), vault.held(USDC));
    }

    function test_OnlyApprovedVaultsAfterTheirWaitCanReceiveFunds() public {
        _split(PROFIT, 1_000e6);
        TestVault4626 unknown = new TestVault4626(usdc);
        vm.prank(agent);
        vm.expectRevert(BoxVault.VaultNotApproved.selector);
        vault.sweepToVault(USDC, PROFIT, address(unknown), 1);
        vm.prank(owner);
        vault.approveVault(address(unknown));
        vm.prank(agent);
        vm.expectRevert(BoxVault.VaultNotApproved.selector);
        vault.sweepToVault(USDC, PROFIT, address(unknown), 1);
        vm.prank(owner);
        vault.revokeVault(address(yield));
        vm.prank(agent);
        vm.expectRevert(BoxVault.VaultNotApproved.selector);
        vault.sweepToVault(USDC, PROFIT, address(yield), 1);
    }

    function test_TaxesCanInvestAtMostHalfAndPayrollAndOperatingNothing() public {
        _split(TAXES, 2_000e6);
        _split(PAYROLL, 1_000e6);
        _split(OPERATING, 1_000e6);
        vm.startPrank(agent);
        vault.sweepToVault(USDC, TAXES, address(yield), 1_000e6);
        vm.expectRevert(BoxVault.InvestLimit.selector);
        vault.sweepToVault(USDC, TAXES, address(yield), 1);
        vm.expectRevert(BoxVault.InvestLimit.selector);
        vault.sweepToVault(USDC, PAYROLL, address(yield), 1);
        vm.expectRevert(BoxVault.InvestLimit.selector);
        vault.sweepToVault(USDC, OPERATING, address(yield), 1);
        vm.stopPrank();
    }

    function test_TheOwnerCanTightenTheInvestLimit() public {
        _split(PROFIT, 1_000e6);
        vm.prank(owner);
        vault.setMaxInvestBps(PROFIT, 2_000);
        vm.startPrank(agent);
        vault.sweepToVault(USDC, PROFIT, address(yield), 200e6);
        vm.expectRevert(BoxVault.InvestLimit.selector);
        vault.sweepToVault(USDC, PROFIT, address(yield), 1);
        vm.stopPrank();
    }

    function test_AVaultThatRefusesToRedeemDoesNotLockTheOtherBoxes() public {
        _split(PROFIT, 1_000e6);
        _split(SALARY, 1_000e6);
        vm.prank(agent);
        vault.sweepToVault(USDC, PROFIT, address(yield), 1_000e6);
        yield.setFailRedeem(true);
        vm.prank(agent);
        vm.expectRevert();
        vault.redeem(USDC, PROFIT, address(yield), 1);
        vm.prank(owner);
        vault.withdraw(USDC, SALARY, 1_000e6, supplier);
        assertEq(usdc.balanceOf(supplier), 1_000e6);
    }

    function test_TheOwnerCanAlsoRedeem() public {
        _split(PROFIT, 1_000e6);
        vm.prank(agent);
        vault.sweepToVault(USDC, PROFIT, address(yield), 1_000e6);
        uint256 shares = vault.sharesOf(address(yield), PROFIT);
        vm.prank(owner);
        vault.redeem(USDC, PROFIT, address(yield), shares);
        assertEq(vault.boxBalance(USDC, PROFIT), 1_000e6);
    }

    function test_AnAgentCannotSweepMoreThanTheBoxHoldsOrASecondAsset() public {
        _split(PROFIT, 100e6);
        vm.prank(agent);
        vm.expectRevert(BoxLedger.InsufficientBox.selector);
        vault.sweepToVault(USDC, PROFIT, address(yield), 100e6 + 1);
        vm.prank(agent);
        vm.expectRevert(BoxVault.VaultAssetMismatch.selector);
        vault.sweepToVault(2, PROFIT, address(yield), 1);
    }

    function test_AnAgentWithoutACapOrWindowCanPayNothing() public {
        _split(TAXES, 1_000e6);
        vm.prank(owner);
        vault.setAgent(agent, 1_000e6, 0);
        vm.prank(agent);
        vm.expectRevert(BoxVault.CapExceeded.selector);
        vault.payAllowlisted(USDC, TAXES, taxOffice, 1);
        vm.prank(owner);
        vault.setAgent(agent, 0, 1 days);
        vm.prank(agent);
        vm.expectRevert(BoxVault.CapExceeded.selector);
        vault.payAllowlisted(USDC, TAXES, taxOffice, 1);
    }

    function test_OnlyTheOwnerRejectsProposalsAndSetsInvestLimits() public {
        vm.prank(agent);
        uint256 id = vault.proposeLargePayment(USDC, SALARY, supplier, 1, bytes32(0));
        vm.prank(stranger);
        vm.expectRevert(BoxLedger.NotOwner.selector);
        vault.rejectProposal(id);
        vm.prank(agent);
        vm.expectRevert(BoxLedger.NotOwner.selector);
        vault.setMaxInvestBps(PROFIT, 10_000);
        vm.prank(owner);
        vm.expectRevert(BoxVault.InvalidBps.selector);
        vault.setMaxInvestBps(PROFIT, 10_001);
    }

    function test_ReceiptsForAgentActions() public {
        _split(TAXES, 1_000e6);
        vm.expectEmit(true, true, true, true, address(vault));
        emit BoxVault.AgentPaid(USDC, TAXES, taxOffice, 100e6, 900e6);
        vm.prank(agent);
        vault.payAllowlisted(USDC, TAXES, taxOffice, 100e6);
    }
}
