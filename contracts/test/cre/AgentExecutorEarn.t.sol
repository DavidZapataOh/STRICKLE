// contracts/test/cre/AgentExecutorEarn.t.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Test} from "forge-std/Test.sol";
import {AgentExecutor} from "../../src/cre/AgentExecutor.sol";
import {AgentState} from "../../src/cre/AgentState.sol";
import {BoxVault} from "../../src/vault/BoxVault.sol";
import {BoxVaultFactory} from "../../src/vault/BoxVaultFactory.sol";
import {TestEarnAdapter} from "../fixtures/TestEarnAdapter.sol";
import {TestToken} from "../fixtures/TestToken.sol";
import {TestVault4626} from "../fixtures/TestVault4626.sol";
import {Vaults} from "../fixtures/Vaults.sol";

contract AgentExecutorEarnTest is Test {
    uint8 internal constant PROFIT = 5;
    uint8 internal constant USDC = 1;
    uint8 internal constant EARN_IN = 7;
    uint8 internal constant EARN_OUT = 8;

    address forwarder = makeAddr("forwarder");
    address deployer = makeAddr("deployer");
    address user = makeAddr("user");
    bytes32 workflow = keccak256("strickle-agent");

    TestToken usdc;
    TestVault4626 yield;
    TestEarnAdapter adapter;
    AgentState state;
    AgentExecutor executor;
    BoxVault vault;

    function setUp() public {
        vm.warp(1_900_000_000);
        usdc = new TestToken();
        TestToken eurc = new TestToken();
        yield = new TestVault4626(usdc);
        adapter = new TestEarnAdapter(usdc, yield);
        BoxVaultFactory factory = new BoxVaultFactory(address(Vaults.newVault(usdc, eurc)));
        state = new AgentState(forwarder, deployer);
        executor = new AgentExecutor(forwarder, deployer, address(factory), address(state), address(0));
        vm.startPrank(deployer);
        state.setExpectedWorkflowId(workflow);
        state.setExecutor(address(executor));
        executor.setExpectedWorkflowId(workflow);
        vm.stopPrank();
        vault = BoxVault(factory.create(user));
        usdc.mint(address(vault), 4_000e6);
        vm.startPrank(user);
        executor.register(address(vault));
        vault.setAgent(address(executor), 1_000e6, 1 days);
        vault.approveSwapAdapter(address(adapter));
        vault.approveVault(address(yield));
        vm.stopPrank();
        uint8[] memory boxes = new uint8[](1);
        boxes[0] = PROFIT;
        uint256[] memory amounts = new uint256[](1);
        amounts[0] = 4_000e6;
        deliver(1, abi.encode(address(vault), USDC, uint256(4_000e6), boxes, amounts, uint64(1), hex"01"));
        vm.warp(block.timestamp + 1 days + 1);
    }

    function deliver(uint8 action, bytes memory args) internal {
        bytes memory meta = new bytes(64);
        bytes32 id = workflow;
        assembly ("memory-safe") {
            mstore(add(meta, 32), id)
        }
        vm.prank(forwarder);
        executor.onReport(meta, abi.encode(action, args));
    }

    function earnArgs(address token, uint256 amount, uint256 minOut, uint256 seen, uint64 next, bytes memory ciphertext)
        internal
        view
        returns (bytes memory)
    {
        return abi.encode(
            AgentExecutor.EarnReport({
                vault: address(vault),
                asset: USDC,
                box: PROFIT,
                earnVault: address(yield),
                amount: amount,
                minOut: minOut,
                seen: seen,
                data: adapter.payload(token, amount),
                next: next,
                ciphertext: ciphertext
            })
        );
    }

    function floorOf(uint256 expected) internal pure returns (uint256) {
        return (expected * 9_900 + 9_999) / 10_000;
    }

    function putToWork(uint256 amount, uint64 next) internal returns (uint256 shares) {
        deliver(
            EARN_IN,
            earnArgs(
                address(usdc),
                amount,
                floorOf(yield.previewDeposit(amount)),
                vault.boxBalance(USDC, PROFIT),
                next,
                hex"c1f7"
            )
        );
        shares = vault.sharesOf(address(yield), PROFIT);
    }

    function test_aDepositMovesTheBoxAndStoresTheSealedStateInOneTransaction() public {
        uint256 minOut = floorOf(yield.previewDeposit(1_000e6));
        vm.expectEmit(true, true, false, true, address(executor));
        emit AgentExecutor.EarnForwarded(address(vault), PROFIT, true, 1_000e6);
        deliver(EARN_IN, earnArgs(address(usdc), 1_000e6, minOut, 4_000e6, 2, hex"c1f7"));
        assertEq(vault.boxBalance(USDC, PROFIT), 3_000e6);
        assertEq(vault.invested(USDC, PROFIT), 1_000e6);
        assertGe(vault.sharesOf(address(yield), PROFIT), minOut);
        (uint64 version,,) = state.head(address(vault));
        assertEq(version, 2);
    }

    function test_theStoredCiphertextIsTheOneInTheReport() public {
        uint256 minOut = floorOf(yield.previewDeposit(1_000e6));
        vm.expectEmit(true, true, false, true, address(state));
        emit AgentState.StateUpdated(address(vault), 2, hex"c1f7");
        deliver(EARN_IN, earnArgs(address(usdc), 1_000e6, minOut, 4_000e6, 2, hex"c1f7"));
    }

    function test_aWithdrawalBringsTheSharesBackAndStoresTheState() public {
        uint256 shares = putToWork(1_000e6, 2);
        uint256 minOut = floorOf(yield.previewRedeem(shares));
        vm.expectEmit(true, true, false, true, address(executor));
        emit AgentExecutor.EarnForwarded(address(vault), PROFIT, false, shares);
        deliver(EARN_OUT, earnArgs(address(yield), shares, minOut, shares, 3, hex"c2"));
        assertEq(vault.sharesOf(address(yield), PROFIT), 0);
        assertEq(vault.invested(USDC, PROFIT), 0);
        assertGe(vault.boxBalance(USDC, PROFIT), 3_000e6 + minOut);
        (uint64 version,,) = state.head(address(vault));
        assertEq(version, 3);
    }

    function test_aBoxThatChangedSinceTheReadMakesTheReportStale() public {
        uint256 minOut = floorOf(yield.previewDeposit(1_000e6));
        bytes memory args = earnArgs(address(usdc), 1_000e6, minOut, 3_999e6, 2, hex"c1f7");
        vm.expectRevert(abi.encodeWithSelector(AgentExecutor.Stale.selector, uint256(3_999e6), uint256(4_000e6)));
        deliver(EARN_IN, args);
        uint256 shares = putToWork(1_000e6, 2);
        bytes memory out =
            earnArgs(address(yield), shares, floorOf(yield.previewRedeem(shares)), shares + 1, 3, hex"c2");
        vm.expectRevert(abi.encodeWithSelector(AgentExecutor.Stale.selector, shares + 1, shares));
        deliver(EARN_OUT, out);
    }

    function test_aMoveTheVaultRefusesRevertsTheWholeReportAndTheStateDoesNotMove() public {
        uint256 minOut = floorOf(yield.previewDeposit(1_000e6));
        bytes memory args = earnArgs(address(usdc), 1_000e6, minOut - 1, 4_000e6, 2, hex"c1f7");
        vm.expectRevert(BoxVault.BelowOracleBound.selector);
        deliver(EARN_IN, args);
        (uint64 version,,) = state.head(address(vault));
        assertEq(version, 1);
        assertEq(vault.boxBalance(USDC, PROFIT), 4_000e6);
    }

    function test_anUnregisteredOrPausedVaultIsRefused() public {
        uint256 minOut = floorOf(yield.previewDeposit(1_000e6));
        bytes memory args = earnArgs(address(usdc), 1_000e6, minOut, 4_000e6, 2, hex"c1f7");
        vm.prank(user);
        vault.pauseAgent();
        vm.expectRevert(AgentExecutor.NotDelegated.selector);
        deliver(EARN_IN, args);
        bytes memory stranger = abi.encode(
            AgentExecutor.EarnReport({
                vault: makeAddr("stranger"),
                asset: USDC,
                box: PROFIT,
                earnVault: address(yield),
                amount: 1,
                minOut: 1,
                seen: 0,
                data: hex"aa3e079c",
                next: 2,
                ciphertext: hex"c1f7"
            })
        );
        vm.expectRevert(AgentExecutor.NotAVault.selector);
        deliver(EARN_IN, stranger);
    }

    function test_anUnknownActionStillReverts() public {
        vm.expectRevert(abi.encodeWithSelector(AgentExecutor.UnknownAction.selector, uint8(9)));
        deliver(9, hex"");
    }
}
