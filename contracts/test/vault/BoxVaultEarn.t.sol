// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Test} from "forge-std/Test.sol";
import {BoxLedger} from "../../src/vault/BoxLedger.sol";
import {BoxVault} from "../../src/vault/BoxVault.sol";
import {BoxVaultFactory} from "../../src/vault/BoxVaultFactory.sol";
import {TestEarnAdapter} from "../fixtures/TestEarnAdapter.sol";
import {TestToken} from "../fixtures/TestToken.sol";
import {TestVault4626} from "../fixtures/TestVault4626.sol";
import {Vaults} from "../fixtures/Vaults.sol";

contract BoxVaultEarnTest is Test {
    uint8 constant TAXES = 1;
    uint8 constant PROFIT = 5;
    uint8 constant USDC = 1;
    uint8 constant EURC = 2;

    TestToken usdc;
    TestToken eurc;
    TestVault4626 yield;
    TestEarnAdapter adapter;
    BoxVault vault;
    address owner = makeAddr("owner");
    address agent = makeAddr("agent");
    address stranger = makeAddr("stranger");

    function setUp() public {
        vm.warp(1_900_000_000);
        usdc = new TestToken();
        eurc = new TestToken();
        yield = new TestVault4626(usdc);
        adapter = new TestEarnAdapter(usdc, yield);
        BoxVaultFactory factory = new BoxVaultFactory(address(Vaults.newVault(usdc, eurc)));
        vault = BoxVault(factory.create(owner));
        address seed = makeAddr("seed");
        usdc.mint(seed, 1_000e6);
        vm.startPrank(seed);
        usdc.approve(address(yield), 1_000e6);
        yield.deposit(1_000e6, seed);
        vm.stopPrank();
        yield.donate(100e6);
        usdc.mint(address(vault), 10_000e6);
        vm.startPrank(owner);
        vault.setAgent(agent, 1_000e6, 1 days);
        vault.approveSwapAdapter(address(adapter));
        vault.approveVault(address(yield));
        vm.stopPrank();
        _split(PROFIT, 4_000e6);
        _split(TAXES, 2_000e6);
        vm.warp(block.timestamp + 1 days + 1);
    }

    function _split(uint8 box, uint256 amount) internal {
        uint8[] memory boxes = new uint8[](1);
        uint256[] memory amounts = new uint256[](1);
        boxes[0] = box;
        amounts[0] = amount;
        vm.prank(agent);
        vault.split(USDC, boxes, amounts);
    }

    function _floor(uint256 expected) internal view returns (uint256) {
        return (expected * (10_000 - vault.swapSlippageBps()) + 9_999) / 10_000;
    }

    function _deposit(uint8 box, uint256 amount) internal returns (uint256 shares) {
        uint256 minOut = _floor(yield.previewDeposit(amount));
        bytes memory data = adapter.payload(address(usdc), amount);
        uint256 before = yield.balanceOf(address(vault));
        vm.prank(agent);
        vault.earnIn(USDC, box, address(yield), amount, minOut, data);
        shares = yield.balanceOf(address(vault)) - before;
    }

    function _withdraw(address caller, uint8 box, uint256 shares) internal {
        uint256 minOut = _floor(yield.previewRedeem(shares));
        bytes memory data = adapter.payload(address(yield), shares);
        vm.prank(caller);
        vault.earnOut(USDC, box, address(yield), shares, minOut, data);
    }

    function test_TheVaultSaysItCanEarn() public view {
        assertEq(vault.EARN_VERSION(), 1);
    }

    function test_TheFixtureHasTheVerifiedAdaptersSelector() public view {
        assertEq(TestEarnAdapter.execute.selector, vault.ADAPTER_EXECUTE());
    }

    function test_ADepositMovesUsdcToSharesAndKeepsTheLedgerExact() public {
        uint256 shares = _deposit(PROFIT, 500e6);
        assertGt(shares, 0);
        assertEq(vault.boxBalance(USDC, PROFIT), 3_500e6);
        assertEq(vault.invested(USDC, PROFIT), 500e6);
        assertEq(vault.sharesOf(address(yield), PROFIT), shares);
        assertEq(yield.balanceOf(address(vault)), shares);
        assertEq(vault.held(USDC), 5_500e6);
        assertLe(vault.held(USDC), usdc.balanceOf(address(vault)));
        assertEq(usdc.allowance(address(vault), address(adapter)), 0);
    }

    function test_AWithdrawalByTheAgentMovesSharesBackToUsdcAndSettlesThePrincipal() public {
        uint256 shares = _deposit(PROFIT, 500e6);
        yield.donate(110e6);
        _withdraw(agent, PROFIT, shares);
        assertEq(vault.sharesOf(address(yield), PROFIT), 0);
        assertEq(vault.invested(USDC, PROFIT), 0);
        assertGt(vault.boxBalance(USDC, PROFIT), 4_000e6);
        assertEq(vault.held(USDC), vault.boxBalance(USDC, PROFIT) + vault.boxBalance(USDC, TAXES));
        assertEq(yield.allowance(address(vault), address(adapter)), 0);
    }

    function test_APartialWithdrawalSettlesThePrincipalInProportion() public {
        uint256 shares = _deposit(PROFIT, 600e6);
        _withdraw(agent, PROFIT, shares / 3);
        assertEq(vault.sharesOf(address(yield), PROFIT), shares - shares / 3);
        assertEq(vault.invested(USDC, PROFIT), 600e6 - (600e6 * (shares / 3)) / shares);
    }

    function test_TheOwnerCanWithdrawWithoutTheAgentAndWhileItIsPaused() public {
        uint256 shares = _deposit(PROFIT, 500e6);
        vm.startPrank(owner);
        vault.pauseAgent();
        vm.stopPrank();
        _withdraw(owner, PROFIT, shares);
        assertEq(vault.sharesOf(address(yield), PROFIT), 0);
    }

    function test_RevertsWhenTheAdapterIsNotApprovedOrBeforeItsDelay() public {
        BoxVaultFactory factory = new BoxVaultFactory(address(Vaults.newVault(usdc, eurc)));
        BoxVault fresh = BoxVault(factory.create(owner));
        usdc.mint(address(fresh), 1_000e6);
        bytes memory data = adapter.payload(address(usdc), 100e6);
        vm.prank(owner);
        fresh.setAgent(agent, 1_000e6, 1 days);
        vm.expectRevert(BoxVault.SwapAdapterNotApproved.selector);
        vm.prank(agent);
        fresh.earnIn(USDC, PROFIT, address(yield), 100e6, 1, data);

        vm.startPrank(owner);
        fresh.approveSwapAdapter(address(adapter));
        fresh.approveVault(address(yield));
        vm.stopPrank();
        vm.expectRevert(BoxVault.SwapAdapterNotApproved.selector);
        vm.prank(agent);
        fresh.earnIn(USDC, PROFIT, address(yield), 100e6, 1, data);
    }

    function test_RevertsOnAnySelectorButExecute() public {
        bytes memory data = abi.encodeWithSelector(bytes4(0xdeadbeef), uint256(1));
        uint256 minOut = _floor(yield.previewDeposit(100e6));
        vm.expectRevert(BoxVault.WrongSelector.selector);
        vm.prank(agent);
        vault.earnIn(USDC, PROFIT, address(yield), 100e6, minOut, data);
    }

    function test_RevertsBelowTheShareBound() public {
        uint256 bound = _floor(yield.previewDeposit(500e6));
        bytes memory data = adapter.payload(address(usdc), 500e6);
        vm.expectRevert(BoxVault.BelowOracleBound.selector);
        vm.prank(agent);
        vault.earnIn(USDC, PROFIT, address(yield), 500e6, bound - 1, data);
        vm.prank(agent);
        vault.earnIn(USDC, PROFIT, address(yield), 500e6, bound, data);
    }

    function test_RevertsBelowTheAssetBoundOnAWithdrawal() public {
        uint256 shares = _deposit(PROFIT, 500e6);
        uint256 bound = _floor(yield.previewRedeem(shares));
        bytes memory data = adapter.payload(address(yield), shares);
        vm.expectRevert(BoxVault.BelowOracleBound.selector);
        vm.prank(agent);
        vault.earnOut(USDC, PROFIT, address(yield), shares, bound - 1, data);
    }

    function test_RevertsWhenTheAdapterDeliversLessThanItWasAskedFor() public {
        adapter.setMode(TestEarnAdapter.Mode.Short);
        uint256 minOut = _floor(yield.previewDeposit(500e6));
        bytes memory data = adapter.payload(address(usdc), 500e6);
        vm.expectRevert(BoxVault.AdapterShort.selector);
        vm.prank(agent);
        vault.earnIn(USDC, PROFIT, address(yield), 500e6, minOut, data);
    }

    function test_RevertsWhenTheSharesGoToSomeoneElse() public {
        adapter.setMode(TestEarnAdapter.Mode.ToStranger);
        uint256 minOut = _floor(yield.previewDeposit(500e6));
        bytes memory data = adapter.payload(address(usdc), 500e6);
        vm.expectRevert(BoxVault.AdapterShort.selector);
        vm.prank(agent);
        vault.earnIn(USDC, PROFIT, address(yield), 500e6, minOut, data);
    }

    function test_RevertsWhenTheAdapterTakesMoreThanTheAmount() public {
        adapter.setMode(TestEarnAdapter.Mode.Overspend);
        usdc.mint(address(vault), 1_000e6);
        uint256 minOut = _floor(yield.previewDeposit(500e6));
        bytes memory data = adapter.payload(address(usdc), 500e6);
        vm.expectRevert();
        vm.prank(agent);
        vault.earnIn(USDC, PROFIT, address(yield), 500e6, minOut, data);
    }

    function test_RevertsWhenTheAdapterReverts() public {
        adapter.setMode(TestEarnAdapter.Mode.Reverts);
        uint256 minOut = _floor(yield.previewDeposit(500e6));
        bytes memory data = adapter.payload(address(usdc), 500e6);
        vm.expectRevert(BoxLedger.TransferFailed.selector);
        vm.prank(agent);
        vault.earnIn(USDC, PROFIT, address(yield), 500e6, minOut, data);
    }

    function test_ADepositCannotPassTheMaxInvestShare() public {
        // taxes allow 50% of the box, including what is already invested
        uint256 minOut = _floor(yield.previewDeposit(1_000e6));
        bytes memory data = adapter.payload(address(usdc), 1_000e6);
        vm.prank(agent);
        vault.earnIn(USDC, TAXES, address(yield), 1_000e6, minOut, data);
        minOut = _floor(yield.previewDeposit(1));
        data = adapter.payload(address(usdc), 1);
        vm.expectRevert(BoxVault.InvestLimit.selector);
        vm.prank(agent);
        vault.earnIn(USDC, TAXES, address(yield), 1, minOut, data);
    }

    function test_ADepositCannotTakeTheBoxBelowItsFloor() public {
        BoxLedger.Rule memory rule = BoxLedger.Rule(24 hours, true, false, 3_500e6, 0);
        vm.prank(owner);
        vault.setRule(PROFIT, rule);
        _deposit(PROFIT, 500e6);
        uint256 minOut = _floor(yield.previewDeposit(1));
        bytes memory data = adapter.payload(address(usdc), 1);
        vm.expectRevert(BoxVault.BelowFloor.selector);
        vm.prank(agent);
        vault.earnIn(USDC, PROFIT, address(yield), 1, minOut, data);
    }

    function test_RevertsForAVaultTheOwnerDidNotApproveOrOfTheWrongAsset() public {
        TestVault4626 other = new TestVault4626(usdc);
        bytes memory data = adapter.payload(address(usdc), 100e6);
        vm.expectRevert(BoxVault.VaultNotApproved.selector);
        vm.prank(agent);
        vault.earnIn(USDC, PROFIT, address(other), 100e6, 1, data);
        vm.expectRevert(BoxVault.VaultAssetMismatch.selector);
        vm.prank(agent);
        vault.earnIn(EURC, PROFIT, address(yield), 100e6, 1, data);
    }

    function test_OnlyTheAgentDepositsAndNothingMovesWhileItIsPaused() public {
        uint256 minOut = _floor(yield.previewDeposit(100e6));
        bytes memory data = adapter.payload(address(usdc), 100e6);
        vm.expectRevert(BoxVault.NotAgent.selector);
        vm.prank(stranger);
        vault.earnIn(USDC, PROFIT, address(yield), 100e6, minOut, data);
        vm.expectRevert(BoxVault.NotAgent.selector);
        vm.prank(owner);
        vault.earnIn(USDC, PROFIT, address(yield), 100e6, minOut, data);
        vm.prank(owner);
        vault.pauseAgent();
        vm.expectRevert(BoxVault.AgentIsPaused.selector);
        vm.prank(agent);
        vault.earnIn(USDC, PROFIT, address(yield), 100e6, minOut, data);
    }

    function test_AStrangerCannotWithdraw() public {
        uint256 shares = _deposit(PROFIT, 100e6);
        bytes memory data = adapter.payload(address(yield), shares);
        vm.expectRevert(BoxVault.NotAgent.selector);
        vm.prank(stranger);
        vault.earnOut(USDC, PROFIT, address(yield), shares, 1, data);
    }

    function test_CannotWithdrawMoreSharesThanTheBoxOwns() public {
        uint256 shares = _deposit(PROFIT, 100e6);
        _deposit(TAXES, 100e6);
        bytes memory data = adapter.payload(address(yield), shares + 1);
        vm.expectRevert(BoxVault.InsufficientShares.selector);
        vm.prank(agent);
        vault.earnOut(USDC, PROFIT, address(yield), shares + 1, 1, data);
    }

    function test_ZeroAmountAndMoreThanTheBoxHoldsRevert() public {
        bytes memory data = adapter.payload(address(usdc), 1);
        vm.expectRevert(BoxLedger.ZeroAmount.selector);
        vm.prank(agent);
        vault.earnIn(USDC, PROFIT, address(yield), 0, 1, data);
        vm.expectRevert(BoxLedger.InsufficientBox.selector);
        vm.prank(agent);
        vault.earnIn(USDC, PROFIT, address(yield), 4_001e6, 1, data);
    }

    function test_AWithdrawalStillWorksAfterTheOwnerRevokesTheVault() public {
        uint256 shares = _deposit(PROFIT, 500e6);
        vm.prank(owner);
        vault.revokeVault(address(yield));
        _withdraw(owner, PROFIT, shares);
        assertEq(vault.sharesOf(address(yield), PROFIT), 0);
    }

    function test_TheSwapSlippageSettingAlsoBoundsEarnMoves() public {
        vm.prank(owner);
        vault.setSwapSlippageBps(30);
        uint256 bound = _floor(yield.previewDeposit(500e6));
        assertEq(bound, (yield.previewDeposit(500e6) * 9_970 + 9_999) / 10_000);
        bytes memory data = adapter.payload(address(usdc), 500e6);
        vm.expectRevert(BoxVault.BelowOracleBound.selector);
        vm.prank(agent);
        vault.earnIn(USDC, PROFIT, address(yield), 500e6, bound - 1, data);
    }

    function test_OneUnitAmountsAndTheRoundingOfShares() public {
        uint256 shares = _deposit(PROFIT, 1);
        assertEq(vault.sharesOf(address(yield), PROFIT), shares);
        assertEq(vault.invested(USDC, PROFIT), 1);
    }
}
