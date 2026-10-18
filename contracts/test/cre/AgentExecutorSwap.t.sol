// contracts/test/cre/AgentExecutorSwap.t.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Test} from "forge-std/Test.sol";
import {AgentExecutor} from "../../src/cre/AgentExecutor.sol";
import {AgentState} from "../../src/cre/AgentState.sol";
import {BoxVault} from "../../src/vault/BoxVault.sol";
import {BoxVaultFactory} from "../../src/vault/BoxVaultFactory.sol";
import {TestFeed} from "../fixtures/TestFeed.sol";
import {TestSwapAdapter} from "../fixtures/TestSwapAdapter.sol";
import {TestToken} from "../fixtures/TestToken.sol";

contract AgentExecutorSwapTest is Test {
    uint8 internal constant PAYROLL = 2;
    uint8 internal constant USDC = 1;
    uint8 internal constant EURC = 2;
    uint8 internal constant SWAP = 6;

    address forwarder = makeAddr("forwarder");
    address deployer = makeAddr("deployer");
    address user = makeAddr("user");
    bytes32 workflow = keccak256("strickle-agent");

    TestToken usdc;
    TestToken eurc;
    TestFeed usdcFeed;
    TestFeed eurcFeed;
    TestSwapAdapter adapter;
    AgentState state;
    AgentExecutor executor;
    BoxVault vault;

    function setUp() public {
        vm.warp(1_900_000_000);
        usdc = new TestToken();
        eurc = new TestToken();
        usdcFeed = new TestFeed(1e8);
        eurcFeed = new TestFeed(112_000_000);
        adapter = new TestSwapAdapter(usdc, eurc);
        BoxVaultFactory factory = new BoxVaultFactory(
            address(new BoxVault(address(usdc), address(eurc), address(usdcFeed), address(eurcFeed), 26 hours))
        );
        state = new AgentState(forwarder, deployer);
        executor = new AgentExecutor(forwarder, deployer, address(factory), address(state), address(0));
        vm.startPrank(deployer);
        state.setExpectedWorkflowId(workflow);
        state.setExecutor(address(executor));
        executor.setExpectedWorkflowId(workflow);
        vm.stopPrank();
        vault = BoxVault(factory.create(user));
        usdc.mint(address(vault), 4_000e6);
        eurc.mint(address(adapter), 1_000_000e6);
        vm.startPrank(user);
        executor.register(address(vault));
        vault.setAgent(address(executor), 1_000e6, 1 days);
        vault.setSwapCap(5_000e6, 1 days);
        vault.approveSwapAdapter(address(adapter));
        vm.stopPrank();
        uint8[] memory boxes = new uint8[](1);
        boxes[0] = PAYROLL;
        uint256[] memory amounts = new uint256[](1);
        amounts[0] = 4_000e6;
        deliver(1, abi.encode(address(vault), USDC, uint256(4_000e6), boxes, amounts, uint64(1), hex"01"));
        vm.warp(block.timestamp + 1 days + 1);
        usdcFeed.touch();
        eurcFeed.touch();
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

    function swapArgs(uint256 amountIn, uint256 minOut, uint256 seen, uint64 next, bytes memory ciphertext)
        internal
        view
        returns (bytes memory)
    {
        return abi.encode(
            address(vault),
            PAYROLL,
            USDC,
            amountIn,
            minOut,
            seen,
            adapter.payload(address(usdc), amountIn),
            next,
            ciphertext
        );
    }

    function test_aSwapMovesTheBoxAndStoresTheSealedStateInOneTransaction() public {
        uint256 minOut = vault.minSwapOutput(USDC, 1_000e6);
        vm.expectEmit(true, true, true, true, address(executor));
        emit AgentExecutor.Swapped(address(vault), PAYROLL, USDC, 1_000e6);
        deliver(SWAP, swapArgs(1_000e6, minOut, 4_000e6, 2, hex"c1f7"));
        assertEq(vault.boxBalance(USDC, PAYROLL), 3_000e6);
        assertGe(vault.boxBalance(EURC, PAYROLL), minOut);
        (uint64 version,,) = state.head(address(vault));
        assertEq(version, 2);
    }

    function test_theStoredCiphertextIsTheOneInTheReport() public {
        uint256 minOut = vault.minSwapOutput(USDC, 1_000e6);
        vm.expectEmit(true, true, false, true, address(state));
        emit AgentState.StateUpdated(address(vault), 2, hex"c1f7");
        deliver(SWAP, swapArgs(1_000e6, minOut, 4_000e6, 2, hex"c1f7"));
    }

    function test_aBoxThatChangedSinceTheReadMakesTheReportStale() public {
        uint256 minOut = vault.minSwapOutput(USDC, 1_000e6);
        bytes memory args = swapArgs(1_000e6, minOut, 3_999e6, 2, hex"c1f7");
        vm.expectRevert(abi.encodeWithSelector(AgentExecutor.Stale.selector, uint256(3_999e6), uint256(4_000e6)));
        deliver(SWAP, args);
    }

    function test_aSwapTheVaultRefusesRevertsTheWholeReportAndTheStateDoesNotMove() public {
        uint256 minOut = vault.minSwapOutput(USDC, 1_000e6);
        bytes memory args = swapArgs(1_000e6, minOut - 1, 4_000e6, 2, hex"c1f7");
        vm.expectRevert(BoxVault.BelowOracleBound.selector);
        deliver(SWAP, args);
        (uint64 version,,) = state.head(address(vault));
        assertEq(version, 1);
        assertEq(vault.boxBalance(USDC, PAYROLL), 4_000e6);
    }

    function test_anUnregisteredOrPausedVaultIsRefused() public {
        uint256 minOut = vault.minSwapOutput(USDC, 1_000e6);
        bytes memory args = swapArgs(1_000e6, minOut, 4_000e6, 2, hex"c1f7");
        vm.prank(user);
        vault.pauseAgent();
        vm.expectRevert(AgentExecutor.NotDelegated.selector);
        deliver(SWAP, args);
        bytes memory stranger = abi.encode(
            makeAddr("stranger"), PAYROLL, USDC, uint256(1), uint256(1), uint256(0), hex"aa3e079c", uint64(2), hex"c1f7"
        );
        vm.expectRevert(AgentExecutor.NotAVault.selector);
        deliver(SWAP, stranger);
    }

    function test_anUnknownActionStillReverts() public {
        vm.expectRevert(abi.encodeWithSelector(AgentExecutor.UnknownAction.selector, uint8(9)));
        deliver(9, hex"");
    }

    function test_theExecutorsOwnOverheadIsSmall() public {
        uint256 minOut = vault.minSwapOutput(USDC, 1_000e6);
        bytes memory args = swapArgs(1_000e6, minOut, 4_000e6, 2, hex"c1f7");
        uint256 before = gasleft();
        deliver(SWAP, args);
        uint256 used = before - gasleft();
        // swapBox with the test adapter is about 206k; the report adds decoding, two reads and the state store
        assertLt(used, 300_000);
    }
}
