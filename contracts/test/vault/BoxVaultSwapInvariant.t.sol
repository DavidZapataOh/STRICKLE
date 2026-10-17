// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Test} from "forge-std/Test.sol";
import {BoxVault} from "../../src/vault/BoxVault.sol";
import {BoxVaultFactory} from "../../src/vault/BoxVaultFactory.sol";
import {TestFeed} from "../fixtures/TestFeed.sol";
import {TestSwapAdapter} from "../fixtures/TestSwapAdapter.sol";
import {TestToken} from "../fixtures/TestToken.sol";

contract SwapHandler is Test {
    BoxVault public vault;
    TestToken public usdc;
    TestToken public eurc;
    TestFeed public usdcFeed;
    TestFeed public eurcFeed;
    TestSwapAdapter public adapter;
    address public owner;
    address public agent;
    uint256 public overBound;
    uint256 public swaps;

    constructor(
        BoxVault vault_,
        TestToken usdc_,
        TestToken eurc_,
        TestFeed usdcFeed_,
        TestFeed eurcFeed_,
        TestSwapAdapter adapter_,
        address owner_,
        address agent_
    ) {
        vault = vault_;
        usdc = usdc_;
        eurc = eurc_;
        usdcFeed = usdcFeed_;
        eurcFeed = eurcFeed_;
        adapter = adapter_;
        owner = owner_;
        agent = agent_;
    }

    function mint(bool inUsdc, uint256 amount) external {
        amount = bound(amount, 1, 2_000e6);
        (inUsdc ? usdc : eurc).mint(address(vault), amount);
    }

    function split(bool inUsdc, uint8 box, uint256 amount) external {
        uint8 asset = inUsdc ? 1 : 2;
        uint256 free = vault.unallocated(asset);
        if (free == 0) return;
        uint8[] memory boxes = new uint8[](1);
        uint256[] memory amounts = new uint256[](1);
        boxes[0] = uint8(bound(box, 1, 6));
        amounts[0] = bound(amount, 1, free);
        vm.prank(agent);
        try vault.split(asset, boxes, amounts) {} catch {}
    }

    function movePrices(uint256 usdcPrice, uint256 eurcPrice) external {
        usdcFeed.setAnswer(int256(bound(usdcPrice, 0.5e8, 2e8)));
        eurcFeed.setAnswer(int256(bound(eurcPrice, 0.5e8, 2e8)));
        usdcFeed.touch();
        eurcFeed.touch();
    }

    /// @dev Values above 4 mean an honest adapter, so most calls are honest and the rest are hostile in turn.
    function setMode(uint8 mode) external {
        adapter.setMode(TestSwapAdapter.Mode(mode <= 4 ? mode : 0));
    }

    function swap(bool inUsdc, uint8 box, uint256 amount, uint256 skewBps, bool exactBound) external {
        uint8 assetIn = inUsdc ? 1 : 2;
        box = uint8(bound(box, 1, 6));
        uint256 balance = vault.boxBalance(assetIn, box);
        if (balance == 0) return;
        amount = bound(amount, 1, balance);
        // the adapter pays the feed ratio give or take a couple of percent, so honest swaps both clear the bound and miss it
        (uint256 priceIn, uint256 priceOut) = _prices(assetIn);
        adapter.setRate((priceIn * 1e6 * bound(skewBps, 9_700, 10_100)) / (priceOut * 10_000));
        uint256 minOut;
        try vault.minSwapOutput(assetIn, amount) returns (uint256 floor_) {
            minOut = exactBound ? floor_ : floor_ + 1;
        } catch {
            return;
        }
        _attempt(box, assetIn, amount, minOut);
    }

    function _attempt(uint8 box, uint8 assetIn, uint256 amount, uint256 minOut) internal {
        uint8 assetOut = assetIn == 1 ? 2 : 1;
        bytes memory data = adapter.payload(assetIn == 1 ? address(usdc) : address(eurc), amount);
        uint256 outBefore = vault.boxBalance(assetOut, box);
        vm.prank(agent);
        try vault.swapBox(box, assetIn, amount, minOut, data) {
            swaps++;
            if (_lossBeyondBound(assetIn, amount, vault.boxBalance(assetOut, box) - outBefore)) overBound++;
        } catch {}
    }

    function _lossBeyondBound(uint8 assetIn, uint256 amount, uint256 received) internal view returns (bool) {
        (uint256 priceIn, uint256 priceOut) = _prices(assetIn);
        uint256 valueIn = amount * priceIn;
        uint256 valueOut = (received + 1) * priceOut;
        return valueIn > valueOut
            && (valueIn - valueOut) * 10_000 > valueIn * (vault.MAX_SWAP_SLIPPAGE_BPS() + vault.FEED_LAG_BPS());
    }

    function pauseOrResume(bool pause) external {
        vm.prank(owner);
        if (pause) vault.pauseAgent();
        else vault.resumeAgent();
    }

    function pass(uint256 seconds_) external {
        vm.warp(block.timestamp + bound(seconds_, 0, 3 days));
    }

    function sumBoxes(uint8 asset) public view returns (uint256 total) {
        for (uint8 box = 1; box <= 6; ++box) {
            total += vault.boxBalance(asset, box);
        }
    }

    function _prices(uint8 assetIn) internal view returns (uint256 priceIn, uint256 priceOut) {
        (, int256 usdcAnswer,,,) = usdcFeed.latestRoundData();
        (, int256 eurcAnswer,,,) = eurcFeed.latestRoundData();
        return assetIn == 1 ? (uint256(usdcAnswer), uint256(eurcAnswer)) : (uint256(eurcAnswer), uint256(usdcAnswer));
    }
}

contract BoxVaultSwapInvariantTest is Test {
    SwapHandler internal handler;
    BoxVault internal vault;
    TestToken internal usdc;
    TestToken internal eurc;
    TestSwapAdapter internal adapter;

    function setUp() public {
        vm.warp(1_900_000_000);
        usdc = new TestToken();
        eurc = new TestToken();
        TestFeed usdcFeed = new TestFeed(1e8);
        TestFeed eurcFeed = new TestFeed(112_000_000);
        adapter = new TestSwapAdapter(usdc, eurc);
        BoxVaultFactory factory = new BoxVaultFactory(
            address(new BoxVault(address(usdc), address(eurc), address(usdcFeed), address(eurcFeed), 26 hours))
        );
        address owner = makeAddr("owner");
        address agent = makeAddr("agent");
        vault = BoxVault(factory.create(owner));
        usdc.mint(address(adapter), 100_000_000e6);
        eurc.mint(address(adapter), 100_000_000e6);
        vm.startPrank(owner);
        vault.setAgent(agent, 500e6, 1 days);
        vault.setSwapCap(1_000e6, 1 days);
        vault.approveSwapAdapter(address(adapter));
        vm.stopPrank();
        vm.warp(block.timestamp + 1 days + 1);
        usdcFeed.touch();
        eurcFeed.touch();
        handler = new SwapHandler(vault, usdc, eurc, usdcFeed, eurcFeed, adapter, owner, agent);
        targetContract(address(handler));
    }

    function test_TheHandlerReallySwapsSoTheInvariantsAreNotVacuous() public {
        handler.mint(true, 1_000e6);
        handler.split(true, 2, 1_000e6);
        handler.setMode(5);
        handler.swap(true, 2, 500e6, 10_000, true);
        assertEq(handler.swaps(), 1);
        assertGt(vault.boxBalance(2, 2), 0);
    }

    function invariant_TheVaultAlwaysHoldsWhatItOwesInBothAssets() public view {
        assertGe(usdc.balanceOf(address(vault)), vault.held(1));
        assertGe(eurc.balanceOf(address(vault)), vault.held(2));
    }

    function invariant_HeldFundsAreExactlyTheBoxesInBothAssets() public view {
        assertEq(vault.held(1), handler.sumBoxes(1));
        assertEq(vault.held(2), handler.sumBoxes(2));
    }

    function invariant_NoApprovalToTheAdapterSurvivesACall() public view {
        assertEq(usdc.allowance(address(vault), address(adapter)), 0);
        assertEq(eurc.allowance(address(vault), address(adapter)), 0);
    }

    function invariant_NoSwapEverLosesMoreThanThePriceBound() public view {
        assertEq(handler.overBound(), 0);
    }

    function invariant_TheSwapCapWindowNeverOverflows() public view {
        assertLe(vault.swapWindowSpent(), vault.swapCap());
    }
}
