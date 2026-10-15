// contracts/test/cre/AgentExecutor.t.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Test} from "forge-std/Test.sol";
import {AgentExecutor} from "../../src/cre/AgentExecutor.sol";
import {CreReceiver} from "../../src/cre/CreReceiver.sol";
import {AgentState} from "../../src/cre/AgentState.sol";
import {BoxVault} from "../../src/vault/BoxVault.sol";
import {BoxVaultFactory} from "../../src/vault/BoxVaultFactory.sol";
import {TestToken} from "../fixtures/TestToken.sol";

contract FakeVault {
    address public owner;

    constructor(address owner_) {
        owner = owner_;
    }
}

contract AgentExecutorTest is Test {
    uint8 internal constant OPERATING = 4;
    uint8 internal constant PROFIT = 6;
    uint8 internal constant USDC = 1;

    address forwarder = makeAddr("forwarder");
    address deployer = makeAddr("deployer");
    address user = makeAddr("user");
    bytes32 workflow = keccak256("strickle-agent");

    TestToken usdc;
    BoxVaultFactory factory;
    AgentState state;
    AgentExecutor executor;
    BoxVault vault;

    function setUp() public {
        usdc = new TestToken();
        TestToken eurc = new TestToken();
        factory = new BoxVaultFactory(address(new BoxVault(address(usdc), address(eurc))));
        state = new AgentState(forwarder, deployer);
        executor = new AgentExecutor(forwarder, deployer, address(factory), address(state));
        vm.startPrank(deployer);
        state.setExpectedWorkflowId(workflow);
        state.setExecutor(address(executor));
        executor.setExpectedWorkflowId(workflow);
        vm.stopPrank();
        vault = BoxVault(factory.create(user));
    }

    function delegate() internal {
        vm.prank(user);
        vault.setAgent(address(executor), 1_000e6, 1 days);
    }

    function deliver(bytes memory args) internal {
        bytes memory meta = new bytes(64);
        bytes32 id = workflow;
        assembly ("memory-safe") {
            mstore(add(meta, 32), id)
        }
        vm.prank(forwarder);
        executor.onReport(meta, abi.encode(uint8(1), args));
    }

    function splitArgs(uint256 seen, uint256 operating, uint256 profit, uint64 next)
        internal
        view
        returns (bytes memory)
    {
        uint8[] memory boxes = new uint8[](2);
        boxes[0] = OPERATING;
        boxes[1] = PROFIT;
        uint256[] memory amounts = new uint256[](2);
        amounts[0] = operating;
        amounts[1] = profit;
        return abi.encode(address(vault), USDC, seen, boxes, amounts, next, hex"c1f7");
    }

    function test_registersAGenuineVaultOnce() public {
        vm.prank(user);
        executor.register(address(vault));
        assertTrue(executor.registered(address(vault)));
        assertEq(executor.count(), 1);
        vm.expectRevert(AgentExecutor.AlreadyRegistered.selector);
        vm.prank(user);
        executor.register(address(vault));
    }

    function test_onlyTheVaultsOwnerRegistersIt() public {
        vm.expectRevert(CreReceiver.NotOwner.selector);
        executor.register(address(vault));
    }

    function test_refusesAnImpostorThatMerelyAnswersOwner() public {
        FakeVault fake = new FakeVault(user);
        vm.expectRevert(AgentExecutor.NotAVault.selector);
        vm.prank(user);
        executor.register(address(fake));
    }

    function test_pendingListsOnlyDelegatedUnpausedVaultsWithFunds() public {
        vm.prank(user);
        executor.register(address(vault));
        usdc.mint(address(vault), 1_000_000);
        assertEq(executor.pending(0, 10).length, 0);

        delegate();
        AgentExecutor.Pending[] memory list = executor.pending(0, 10);
        assertEq(list.length, 1);
        assertEq(list[0].vault, address(vault));
        assertEq(list[0].asset, USDC);
        assertEq(list[0].amount, 1_000_000);

        vm.prank(user);
        vault.pauseAgent();
        assertEq(executor.pending(0, 10).length, 0);

        vm.prank(user);
        vault.revokeAgent();
        assertEq(executor.pending(0, 10).length, 0);
    }

    function test_pendingWrapsAroundTheRegistryFromTheSeedAndStopsAtMaxHits() public {
        address second = makeAddr("second");
        BoxVault other = BoxVault(factory.create(second));
        vm.prank(user);
        executor.register(address(vault));
        vm.prank(second);
        executor.register(address(other));
        vm.prank(user);
        vault.setAgent(address(executor), 1_000e6, 1 days);
        vm.prank(second);
        other.setAgent(address(executor), 1_000e6, 1 days);
        usdc.mint(address(vault), 1);
        usdc.mint(address(other), 2);
        assertEq(executor.pending(0, 1).length, 1);
        assertEq(executor.pending(1, 1)[0].vault, address(other));
        assertEq(executor.pending(2, 5).length, 2);
    }

    function test_aSplitMovesTheFundsAndStoresTheStateInOneTransaction() public {
        vm.prank(user);
        executor.register(address(vault));
        delegate();
        usdc.mint(address(vault), 1_000_000);

        vm.expectEmit(true, true, false, true, address(state));
        emit AgentState.StateUpdated(address(vault), 1, hex"c1f7");
        deliver(splitArgs(1_000_000, 840_000, 160_000, 1));

        assertEq(vault.boxBalance(USDC, OPERATING), 840_000);
        assertEq(vault.boxBalance(USDC, PROFIT), 160_000);
        assertEq(vault.unallocated(USDC), 0);
        (uint64 version,,) = state.head(address(vault));
        assertEq(version, 1);
    }

    function test_aDepositThatLandedAfterTheReadMakesTheReportStale() public {
        vm.prank(user);
        executor.register(address(vault));
        delegate();
        usdc.mint(address(vault), 1_000_000);
        usdc.mint(address(vault), 500_000);
        vm.expectRevert(abi.encodeWithSelector(AgentExecutor.Stale.selector, uint256(1_000_000), uint256(1_500_000)));
        deliver(splitArgs(1_000_000, 840_000, 160_000, 1));
    }

    function test_theSameReportTwiceFailsTheSecondTime() public {
        vm.prank(user);
        executor.register(address(vault));
        delegate();
        usdc.mint(address(vault), 1_000_000);
        deliver(splitArgs(1_000_000, 840_000, 160_000, 1));
        vm.expectRevert(abi.encodeWithSelector(AgentExecutor.Stale.selector, uint256(1_000_000), uint256(0)));
        deliver(splitArgs(1_000_000, 840_000, 160_000, 1));
    }

    function test_refusesASplitThatLeavesFundsUnallocated() public {
        vm.prank(user);
        executor.register(address(vault));
        delegate();
        usdc.mint(address(vault), 1_000_000);
        vm.expectRevert(AgentExecutor.NotFullySplit.selector);
        deliver(splitArgs(1_000_000, 840_000, 100_000, 1));
    }

    function test_refusesAVaultThatNeverDelegated() public {
        vm.prank(user);
        executor.register(address(vault));
        usdc.mint(address(vault), 1_000_000);
        vm.expectRevert(AgentExecutor.NotDelegated.selector);
        deliver(splitArgs(1_000_000, 840_000, 160_000, 1));
    }

    function test_refusesAnUnregisteredVault() public {
        delegate();
        usdc.mint(address(vault), 1_000_000);
        vm.expectRevert(AgentExecutor.NotAVault.selector);
        deliver(splitArgs(1_000_000, 840_000, 160_000, 1));
    }

    function test_refusesAnUnknownAction() public {
        bytes memory meta = new bytes(64);
        bytes32 id = workflow;
        assembly ("memory-safe") {
            mstore(add(meta, 32), id)
        }
        vm.prank(forwarder);
        vm.expectRevert(abi.encodeWithSelector(AgentExecutor.UnknownAction.selector, uint8(9)));
        executor.onReport(meta, abi.encode(uint8(9), hex""));
    }
}
