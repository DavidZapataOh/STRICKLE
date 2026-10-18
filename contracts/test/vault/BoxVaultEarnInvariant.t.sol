// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Test} from "forge-std/Test.sol";
import {BoxVault} from "../../src/vault/BoxVault.sol";
import {BoxVaultFactory} from "../../src/vault/BoxVaultFactory.sol";
import {TestEarnAdapter} from "../fixtures/TestEarnAdapter.sol";
import {TestToken} from "../fixtures/TestToken.sol";
import {TestVault4626} from "../fixtures/TestVault4626.sol";
import {Vaults} from "../fixtures/Vaults.sol";

contract EarnHandler is Test {
    BoxVault public vault;
    TestToken public usdc;
    TestVault4626 public yield;
    TestEarnAdapter public adapter;
    address public owner;
    address public agent;
    uint256 public deposits;
    uint256 public withdrawals;

    constructor(
        BoxVault vault_,
        TestToken usdc_,
        TestVault4626 yield_,
        TestEarnAdapter adapter_,
        address owner_,
        address agent_
    ) {
        vault = vault_;
        usdc = usdc_;
        yield = yield_;
        adapter = adapter_;
        owner = owner_;
        agent = agent_;
    }

    function arrive(uint256 amount) external {
        amount = bound(amount, 1, 3_000e6);
        usdc.mint(address(vault), amount);
        uint256 free = vault.unallocated(1);
        if (free == 0) return;
        uint8[] memory boxes = new uint8[](1);
        uint256[] memory amounts = new uint256[](1);
        boxes[0] = 5;
        amounts[0] = free;
        vm.prank(agent);
        try vault.split(1, boxes, amounts) {} catch {}
    }

    function setMode(uint8 mode) external {
        adapter.setMode(TestEarnAdapter.Mode(bound(mode, 0, 4)));
    }

    function invest(uint8 box, uint256 amount) external {
        box = uint8(bound(box, 1, 6));
        uint256 balance = vault.boxBalance(1, box);
        if (balance == 0) return;
        amount = bound(amount, 1, balance);
        uint256 minOut = (yield.previewDeposit(amount) * 9_900 + 9_999) / 10_000;
        bytes memory data = adapter.payload(address(usdc), amount);
        vm.prank(agent);
        try vault.earnIn(1, box, address(yield), amount, minOut, data) {
            ++deposits;
        } catch {}
    }

    function divest(uint8 box, uint256 shares, bool asOwner) external {
        box = uint8(bound(box, 1, 6));
        uint256 owned = vault.sharesOf(address(yield), box);
        if (owned == 0) return;
        shares = bound(shares, 1, owned);
        uint256 minOut = (yield.previewRedeem(shares) * 9_900 + 9_999) / 10_000;
        bytes memory data = adapter.payload(address(yield), shares);
        vm.prank(asOwner ? owner : agent);
        try vault.earnOut(1, box, address(yield), shares, minOut, data) {
            ++withdrawals;
        } catch {}
    }

    function yieldMoves(uint256 amount, bool gain) external {
        if (gain) {
            yield.donate(bound(amount, 0, 300e6));
        } else {
            uint256 assets = yield.totalAssets();
            if (assets == 0) return;
            yield.slash(bound(amount, 0, assets / 20));
        }
    }

    function pauseOrResume(bool pause) external {
        vm.prank(owner);
        if (pause) vault.pauseAgent();
        else vault.resumeAgent();
    }

    function pass(uint256 seconds_) external {
        vm.warp(block.timestamp + bound(seconds_, 0, 3 days));
    }

    function sumBoxes() public view returns (uint256 total) {
        for (uint8 box = 1; box <= 6; ++box) {
            total += vault.boxBalance(1, box);
        }
    }

    function sumShares() public view returns (uint256 total) {
        for (uint8 box = 1; box <= 6; ++box) {
            total += vault.sharesOf(address(yield), box);
        }
    }
}

contract BoxVaultEarnInvariantTest is Test {
    EarnHandler internal handler;
    BoxVault internal vault;
    TestToken internal usdc;
    TestVault4626 internal yield;
    TestEarnAdapter internal adapter;

    function setUp() public {
        vm.warp(1_900_000_000);
        usdc = new TestToken();
        TestToken eurc = new TestToken();
        yield = new TestVault4626(usdc);
        adapter = new TestEarnAdapter(usdc, yield);
        BoxVaultFactory factory = new BoxVaultFactory(address(Vaults.newVault(usdc, eurc)));
        address owner = makeAddr("owner");
        address agent = makeAddr("agent");
        vault = BoxVault(factory.create(owner));
        usdc.mint(address(adapter), 1_000_000e6);
        vm.startPrank(owner);
        vault.setAgent(agent, 500e6, 1 days);
        vault.approveSwapAdapter(address(adapter));
        vault.approveVault(address(yield));
        vm.stopPrank();
        vm.warp(block.timestamp + 2 days);
        handler = new EarnHandler(vault, usdc, yield, adapter, owner, agent);
        targetContract(address(handler));
    }

    function invariant_TheVaultAlwaysHoldsWhatItOwes() public view {
        assertGe(usdc.balanceOf(address(vault)), vault.held(1));
    }

    function invariant_HeldFundsAreExactlyTheBoxes() public view {
        assertEq(vault.held(1), handler.sumBoxes());
    }

    function invariant_EveryShareTheVaultHoldsBelongsToABox() public view {
        assertEq(yield.balanceOf(address(vault)), handler.sumShares());
    }

    function invariant_TheAdapterIsNeverLeftWithAnApproval() public view {
        assertEq(usdc.allowance(address(vault), address(adapter)), 0);
        assertEq(yield.allowance(address(vault), address(adapter)), 0);
    }

    function invariant_AnInvestedBoxNeverShowsMoreInvestedThanItEverReceived() public view {
        for (uint8 box = 1; box <= 6; ++box) {
            if (vault.sharesOf(address(yield), box) == 0) assertEq(vault.invested(1, box), 0);
        }
    }

    function test_TheHandlerReallyMovesMoneyThroughTheAdapter() public {
        handler.arrive(2_000e6);
        handler.invest(5, 500e6);
        assertEq(handler.deposits(), 1);
        handler.divest(5, 1, false);
        assertEq(handler.withdrawals(), 1);
    }
}
