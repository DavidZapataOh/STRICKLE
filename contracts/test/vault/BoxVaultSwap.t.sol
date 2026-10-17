// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Test} from "forge-std/Test.sol";
import {BoxLedger} from "../../src/vault/BoxLedger.sol";
import {BoxVault} from "../../src/vault/BoxVault.sol";
import {BoxVaultFactory} from "../../src/vault/BoxVaultFactory.sol";
import {TestFeed} from "../fixtures/TestFeed.sol";
import {TestSwapAdapter} from "../fixtures/TestSwapAdapter.sol";
import {TestToken} from "../fixtures/TestToken.sol";

contract BoxVaultSwapTest is Test {
    uint8 constant TAXES = 1;
    uint8 constant PAYROLL = 2;
    uint8 constant USDC = 1;
    uint8 constant EURC = 2;
    uint256 constant USDC_PRICE = 1e8;
    uint256 constant EURC_PRICE = 112_000_000; // 1 EURC = 1.12 USDC

    TestToken usdc;
    TestToken eurc;
    TestFeed usdcFeed;
    TestFeed eurcFeed;
    TestSwapAdapter adapter;
    BoxVault vault;
    address owner = makeAddr("owner");
    address agent = makeAddr("agent");
    address stranger = makeAddr("stranger");
    address supplier = makeAddr("supplier");

    function setUp() public {
        vm.warp(1_900_000_000);
        usdc = new TestToken();
        eurc = new TestToken();
        usdcFeed = new TestFeed(int256(USDC_PRICE));
        eurcFeed = new TestFeed(int256(EURC_PRICE));
        adapter = new TestSwapAdapter(usdc, eurc);
        BoxVaultFactory factory = new BoxVaultFactory(
            address(new BoxVault(address(usdc), address(eurc), address(usdcFeed), address(eurcFeed), 26 hours))
        );
        vault = BoxVault(factory.create(owner));
        usdc.mint(address(vault), 10_000e6);
        eurc.mint(address(adapter), 1_000_000e6);
        usdc.mint(address(adapter), 1_000_000e6);
        vm.startPrank(owner);
        vault.setAgent(agent, 1_000e6, 1 days);
        vault.setSwapCap(5_000e6, 1 days);
        vault.approveSwapAdapter(address(adapter));
        vault.approveRecipient(PAYROLL, supplier);
        vm.stopPrank();
        _split(USDC, PAYROLL, 4_000e6);
        vm.warp(block.timestamp + 1 days + 1);
        usdcFeed.touch();
        eurcFeed.touch();
    }

    function _split(uint8 asset, uint8 box, uint256 amount) internal {
        uint8[] memory boxes = new uint8[](1);
        uint256[] memory amounts = new uint256[](1);
        boxes[0] = box;
        amounts[0] = amount;
        vm.prank(agent);
        vault.split(asset, boxes, amounts);
    }

    function _bound(uint256 amountIn, uint256 priceIn, uint256 priceOut, uint256 slippage)
        internal
        pure
        returns (uint256)
    {
        return (amountIn * priceIn * (10_000 - slippage - 50)) / (priceOut * 10_000);
    }

    function test_TheFixtureHasTheVerifiedAdaptersSelector() public view {
        assertEq(TestSwapAdapter.execute.selector, bytes4(0xaa3e079c));
        assertEq(vault.ADAPTER_EXECUTE(), bytes4(0xaa3e079c));
    }

    function test_SwapsAnAmountOfABoxForTheOtherAssetAndKeepsTheLedgerExact() public {
        uint256 minOut = vault.minSwapOutput(USDC, 1_000e6);
        bytes memory data = adapter.payload(address(usdc), 1_000e6);
        vm.prank(agent);
        vault.swapBox(PAYROLL, USDC, 1_000e6, minOut, data);
        assertEq(vault.boxBalance(USDC, PAYROLL), 3_000e6);
        assertGe(vault.boxBalance(EURC, PAYROLL), minOut);
        assertEq(vault.held(EURC), vault.boxBalance(EURC, PAYROLL));
        assertEq(vault.held(USDC), 3_000e6);
        assertLe(vault.held(USDC), usdc.balanceOf(address(vault)));
        assertLe(vault.held(EURC), eurc.balanceOf(address(vault)));
        assertEq(usdc.allowance(address(vault), address(adapter)), 0);
    }

    function test_TheMinimumIsBoundedByTheFeedsPlusTheLagAllowance() public {
        uint256 bound = _bound(1_000e6, USDC_PRICE, EURC_PRICE, 100);
        assertEq(vault.minSwapOutput(USDC, 1_000e6), bound);
        bytes memory data = adapter.payload(address(usdc), 1_000e6);
        vm.prank(agent);
        vm.expectRevert(BoxVault.BelowOracleBound.selector);
        vault.swapBox(PAYROLL, USDC, 1_000e6, bound - 1, data);
    }

    function test_TheOwnerCanTightenTheSlippageButNeverLoosenItBeyondTheConstant() public {
        vm.startPrank(owner);
        vault.setSwapSlippageBps(20);
        assertEq(vault.swapSlippageBps(), 20);
        vm.expectRevert(BoxVault.InvalidBps.selector);
        vault.setSwapSlippageBps(101);
        vm.expectRevert(BoxVault.InvalidBps.selector);
        vault.setSwapSlippageBps(9);
        vm.stopPrank();
        assertEq(vault.minSwapOutput(USDC, 1_000e6), _bound(1_000e6, USDC_PRICE, EURC_PRICE, 20));
        assertGt(vault.minSwapOutput(USDC, 1_000e6), _bound(1_000e6, USDC_PRICE, EURC_PRICE, 100));
    }

    function test_RefusesAStaleOrNonPositiveFeed() public {
        bytes memory data = adapter.payload(address(usdc), 100e6);
        vm.warp(block.timestamp + 27 hours);
        vm.prank(agent);
        vm.expectRevert(BoxVault.StaleFeed.selector);
        vault.swapBox(PAYROLL, USDC, 100e6, 1, data);
        usdcFeed.touch();
        eurcFeed.touch();
        eurcFeed.setAnswer(0);
        vm.prank(agent);
        vm.expectRevert(BoxVault.StaleFeed.selector);
        vault.swapBox(PAYROLL, USDC, 100e6, 1, data);
    }

    function test_OnlyTheAgentAndOnlyThroughTheApprovedAdapterAndSelector() public {
        uint256 minOut = vault.minSwapOutput(USDC, 100e6);
        bytes memory data = adapter.payload(address(usdc), 100e6);
        vm.prank(stranger);
        vm.expectRevert(BoxVault.NotAgent.selector);
        vault.swapBox(PAYROLL, USDC, 100e6, minOut, data);
        vm.prank(owner);
        vm.expectRevert(BoxVault.NotAgent.selector);
        vault.swapBox(PAYROLL, USDC, 100e6, minOut, data);
        bytes memory wrong = abi.encodeWithSelector(bytes4(0xdeadbeef), uint256(1));
        vm.prank(agent);
        vm.expectRevert(BoxVault.WrongSelector.selector);
        vault.swapBox(PAYROLL, USDC, 100e6, minOut, wrong);
        vm.prank(agent);
        vm.expectRevert(BoxVault.WrongSelector.selector);
        vault.swapBox(PAYROLL, USDC, 100e6, minOut, hex"aa3e07");
        vm.prank(owner);
        vault.revokeSwapAdapter();
        vm.prank(agent);
        vm.expectRevert(BoxVault.SwapAdapterNotApproved.selector);
        vault.swapBox(PAYROLL, USDC, 100e6, minOut, data);
    }

    function test_ANewAdapterWaitsADayAndAPausedAgentCannotSwap() public {
        TestSwapAdapter other = new TestSwapAdapter(usdc, eurc);
        eurc.mint(address(other), 1_000_000e6);
        vm.startPrank(owner);
        vault.revokeSwapAdapter();
        vault.approveSwapAdapter(address(other));
        vm.stopPrank();
        uint256 minOut = vault.minSwapOutput(USDC, 100e6);
        bytes memory data = other.payload(address(usdc), 100e6);
        vm.prank(agent);
        vm.expectRevert(BoxVault.SwapAdapterNotApproved.selector);
        vault.swapBox(PAYROLL, USDC, 100e6, minOut, data);
        vm.warp(block.timestamp + 1 days);
        usdcFeed.touch();
        eurcFeed.touch();
        vm.prank(owner);
        vault.pauseAgent();
        vm.prank(agent);
        vm.expectRevert(BoxVault.AgentIsPaused.selector);
        vault.swapBox(PAYROLL, USDC, 100e6, minOut, data);
    }

    function test_AnotherAdapterCannotBeApprovedWhileOneIsActive() public {
        address another = address(new TestSwapAdapter(usdc, eurc));
        vm.prank(owner);
        vm.expectRevert(BoxVault.SwapAdapterNotApproved.selector);
        vault.approveSwapAdapter(another);
    }

    function test_SwapsHaveTheirOwnCap() public {
        vm.prank(owner);
        vault.setSwapCap(1_500e6, 1 days);
        uint256 first = vault.minSwapOutput(USDC, 1_000e6);
        uint256 second = vault.minSwapOutput(USDC, 600e6);
        bytes memory firstData = adapter.payload(address(usdc), 1_000e6);
        bytes memory secondData = adapter.payload(address(usdc), 600e6);
        vm.startPrank(agent);
        vault.swapBox(PAYROLL, USDC, 1_000e6, first, firstData);
        vm.expectRevert(BoxVault.CapExceeded.selector);
        vault.swapBox(PAYROLL, USDC, 600e6, second, secondData);
        vm.stopPrank();
        vm.warp(block.timestamp + 1 days + 1);
        usdcFeed.touch();
        eurcFeed.touch();
        uint256 later = vault.minSwapOutput(USDC, 600e6);
        vm.prank(agent);
        vault.swapBox(PAYROLL, USDC, 600e6, later, secondData);
    }

    function test_AVaultWhoseOwnerSetNoSwapCapSwapsNothing() public {
        vm.prank(owner);
        vault.setSwapCap(0, 1 days);
        uint256 minOut = vault.minSwapOutput(USDC, 100e6);
        bytes memory data = adapter.payload(address(usdc), 100e6);
        vm.prank(agent);
        vm.expectRevert(BoxVault.CapExceeded.selector);
        vault.swapBox(PAYROLL, USDC, 100e6, minOut, data);
    }

    function test_AFullDayOfSwapsLeavesTheWholePaymentCapForPayments() public {
        uint256 minOut = vault.minSwapOutput(USDC, 3_000e6);
        bytes memory data = adapter.payload(address(usdc), 3_000e6);
        vm.prank(agent);
        vault.swapBox(PAYROLL, USDC, 3_000e6, minOut, data);
        // the payment cap (1,000 per day) is untouched: a payment of 900 still goes through
        usdc.mint(address(vault), 1_000e6);
        _split(USDC, PAYROLL, 1_000e6);
        vm.prank(agent);
        vault.payAllowlisted(USDC, PAYROLL, supplier, 900e6);
        assertEq(usdc.balanceOf(supplier), 900e6);
    }

    function test_AnAdapterThatPaysShortOverspendsOrPaysAStrangerCannotMoveTheLedger() public {
        uint256 minOut = vault.minSwapOutput(USDC, 1_000e6);
        bytes memory data = adapter.payload(address(usdc), 1_000e6);
        adapter.setMode(TestSwapAdapter.Mode.Short);
        vm.prank(agent);
        vm.expectRevert(BoxVault.SwapShort.selector);
        vault.swapBox(PAYROLL, USDC, 1_000e6, minOut + 20e6, data);
        adapter.setMode(TestSwapAdapter.Mode.ToStranger);
        vm.prank(agent);
        vm.expectRevert(BoxVault.SwapShort.selector);
        vault.swapBox(PAYROLL, USDC, 1_000e6, minOut, data);
        adapter.setMode(TestSwapAdapter.Mode.Overspend);
        vm.prank(agent);
        vm.expectRevert(BoxLedger.TransferFailed.selector);
        vault.swapBox(PAYROLL, USDC, 1_000e6, minOut, data);
        adapter.setMode(TestSwapAdapter.Mode.Reverts);
        vm.prank(agent);
        vm.expectRevert(BoxLedger.TransferFailed.selector);
        vault.swapBox(PAYROLL, USDC, 1_000e6, minOut, data);
        assertEq(vault.boxBalance(USDC, PAYROLL), 4_000e6);
        assertEq(vault.boxBalance(EURC, PAYROLL), 0);
        assertEq(usdc.allowance(address(vault), address(adapter)), 0);
    }

    function test_CannotSwapMoreThanTheBoxHoldsNorTheSameAssetNorAnUnknownOne() public {
        bytes memory data = adapter.payload(address(usdc), 1e6);
        vm.startPrank(agent);
        vm.expectRevert(BoxLedger.InsufficientBox.selector);
        vault.swapBox(PAYROLL, USDC, 4_001e6, 1, data);
        vm.expectRevert(BoxLedger.UnknownAsset.selector);
        vault.swapBox(PAYROLL, 3, 1e6, 1, data);
        vm.expectRevert(BoxLedger.ZeroAmount.selector);
        vault.swapBox(PAYROLL, USDC, 0, 1, data);
        vm.expectRevert(BoxLedger.UnknownBox.selector);
        vault.swapBox(0, USDC, 1e6, 1, data);
        vm.stopPrank();
    }

    function test_TheOtherDirectionUsesTheInversePrice() public {
        eurc.mint(address(vault), 500e6);
        _split(EURC, PAYROLL, 500e6);
        uint256 bound = _bound(500e6, EURC_PRICE, USDC_PRICE, 100);
        assertEq(vault.minSwapOutput(EURC, 500e6), bound);
        adapter.setRate(1_120_000);
        bytes memory data = adapter.payload(address(eurc), 500e6);
        vm.prank(agent);
        vault.swapBox(PAYROLL, EURC, 500e6, bound, data);
        assertEq(vault.boxBalance(EURC, PAYROLL), 0);
        assertGe(vault.boxBalance(USDC, PAYROLL), 4_000e6 + bound);
    }
}
