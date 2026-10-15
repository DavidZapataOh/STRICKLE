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

    function test_decodesTheReportTheWorkflowEncoder() public view {
        bytes memory encoded = vm.parseBytes(vm.trim(vm.readFile("../workflows/agent/tests/fixtures/split-report.hex")));
        (uint8 action, bytes memory args) = abi.decode(encoded, (uint8, bytes));
        assertEq(action, executor.SPLIT());
        (
            address fixtureVault,
            uint8 asset,
            uint256 seen,
            uint8[] memory boxes,
            uint256[] memory amounts,
            uint64 next,
        ) = abi.decode(args, (address, uint8, uint256, uint8[], uint256[], uint64, bytes));
        assertEq(fixtureVault, address(uint160(0xa1)));
        assertEq(asset, USDC);
        assertEq(seen, 1_000_000);
        assertEq(boxes.length, 2);
        assertEq(amounts[0] + amounts[1], seen);
        assertEq(next, 1);
    }

    address payee = makeAddr("payee");

    function deliverAction(uint8 action, bytes memory args) internal {
        bytes memory meta = new bytes(64);
        bytes32 id = workflow;
        assembly ("memory-safe") {
            mstore(add(meta, 32), id)
        }
        vm.prank(forwarder);
        executor.onReport(meta, abi.encode(action, args));
    }

    function fundSalaryBox(uint256 amount) internal {
        vm.prank(user);
        executor.register(address(vault));
        delegate();
        usdc.mint(address(vault), amount);
        uint8[] memory boxes = new uint8[](1);
        boxes[0] = 3;
        uint256[] memory amounts = new uint256[](1);
        amounts[0] = amount;
        deliver(abi.encode(address(vault), USDC, amount, boxes, amounts, uint64(1), hex"01"));
    }

    function approvePayee() internal {
        vm.prank(user);
        vault.approveRecipient(3, payee);
        vm.warp(block.timestamp + 2 days);
    }

    function salaryArgs(uint256 amount, uint256 seen, uint64 next) internal view returns (bytes memory) {
        return abi.encode(address(vault), USDC, payee, amount, seen, next, hex"5a1a");
    }

    function test_paysTheSalaryToTheApprovedPayeeAndStoresTheState() public {
        fundSalaryBox(1_000_000);
        approvePayee();
        deliverAction(2, salaryArgs(1_000_000, 1_000_000, 2));
        assertEq(usdc.balanceOf(payee), 1_000_000);
        assertEq(vault.boxBalance(USDC, 3), 0);
        (uint64 version,,) = state.head(address(vault));
        assertEq(version, 2);
    }

    function test_refusesAPayeeTheOwnerNeverApproved() public {
        fundSalaryBox(1_000_000);
        vm.expectRevert(BoxVault.RecipientNotApproved.selector);
        deliverAction(2, salaryArgs(1_000_000, 1_000_000, 2));
    }

    function test_refusesWhenTheSalaryBoxChangedSinceTheRead() public {
        fundSalaryBox(1_000_000);
        approvePayee();
        vm.expectRevert(abi.encodeWithSelector(AgentExecutor.Stale.selector, uint256(900_000), uint256(1_000_000)));
        deliverAction(2, salaryArgs(900_000, 900_000, 2));
    }

    function test_theVaultsRollingCapStillBindsTheSalary() public {
        vm.prank(user);
        executor.register(address(vault));
        vm.prank(user);
        vault.setAgent(address(executor), 500_000, 1 days);
        usdc.mint(address(vault), 1_000_000);
        uint8[] memory boxes = new uint8[](1);
        boxes[0] = 3;
        uint256[] memory amounts = new uint256[](1);
        amounts[0] = 1_000_000;
        deliver(abi.encode(address(vault), USDC, uint256(1_000_000), boxes, amounts, uint64(1), hex"01"));
        approvePayee();
        vm.expectRevert(BoxVault.CapExceeded.selector);
        deliverAction(2, salaryArgs(1_000_000, 1_000_000, 2));
    }

    function test_aTickStoresTheStateAndMovesNoMoney() public {
        vm.prank(user);
        executor.register(address(vault));
        delegate();
        usdc.mint(address(vault), 5);
        deliverAction(3, abi.encode(address(vault), uint64(1), hex"7171"));
        (uint64 version,,) = state.head(address(vault));
        assertEq(version, 1);
        assertEq(vault.unallocated(USDC), 5);
    }

    function test_aTickOnAPausedOrUndelegatedVaultIsRefused() public {
        vm.prank(user);
        executor.register(address(vault));
        vm.expectRevert(AgentExecutor.NotDelegated.selector);
        deliverAction(3, abi.encode(address(vault), uint64(1), hex"01"));
        delegate();
        vm.prank(user);
        vault.pauseAgent();
        vm.expectRevert(AgentExecutor.NotDelegated.selector);
        deliverAction(3, abi.encode(address(vault), uint64(1), hex"01"));
    }

    function test_delegatedListsOnlyActiveDelegations() public {
        address second = makeAddr("second");
        BoxVault other = BoxVault(factory.create(second));
        vm.prank(user);
        executor.register(address(vault));
        vm.prank(second);
        executor.register(address(other));
        delegate();
        assertEq(executor.delegated(0, 10).length, 1);
        assertEq(executor.delegated(0, 10)[0], address(vault));
        vm.prank(user);
        vault.pauseAgent();
        assertEq(executor.delegated(0, 10).length, 0);
        assertEq(executor.delegated(5, 1).length, 0);
    }

    function test_decodesTheSalaryAndTickReportsTheWorkflowEncodes() public view {
        (uint8 salaryAction, bytes memory salaryArgs_) = abi.decode(
            vm.parseBytes(vm.trim(vm.readFile("../workflows/agent/tests/fixtures/salary-report.hex"))), (uint8, bytes)
        );
        assertEq(salaryAction, executor.PAY_SALARY());
        (address v, uint8 asset, address p, uint256 amount, uint256 seen, uint64 next,) =
            abi.decode(salaryArgs_, (address, uint8, address, uint256, uint256, uint64, bytes));
        assertEq(v, address(uint160(0xa1)));
        assertEq(p, address(uint160(0xb2)));
        assertEq(asset, USDC);
        assertEq(amount, 1_000_000);
        assertEq(seen, 1_000_000);
        assertEq(next, 2);

        (uint8 tickAction, bytes memory tickArgs) = abi.decode(
            vm.parseBytes(vm.trim(vm.readFile("../workflows/agent/tests/fixtures/tick-report.hex"))), (uint8, bytes)
        );
        assertEq(tickAction, executor.TICK());
        (address tv, uint64 tnext,) = abi.decode(tickArgs, (address, uint64, bytes));
        assertEq(tv, address(uint160(0xa1)));
        assertEq(tnext, 3);
    }

    function test_aNoticeIsPublishedForARegisteredVault() public {
        vm.prank(user);
        executor.register(address(vault));
        vm.expectEmit(true, true, false, true, address(state));
        emit AgentState.Notice(address(vault), 1, hex"aa");
        deliverAction(4, abi.encode(address(vault), uint64(1), hex"aa"));
        assertEq(state.noticeCount(address(vault)), 1);
    }

    function test_aNoticeForAnUnregisteredVaultIsRefused() public {
        vm.expectRevert(AgentExecutor.NotAVault.selector);
        deliverAction(4, abi.encode(address(vault), uint64(1), hex"aa"));
    }

    function test_noticeIdsMustFollowTheChainsCount() public {
        vm.prank(user);
        executor.register(address(vault));
        deliverAction(4, abi.encode(address(vault), uint64(1), hex"aa"));
        vm.expectRevert(abi.encodeWithSelector(AgentState.StaleNotice.selector, uint64(2), uint64(1)));
        deliverAction(4, abi.encode(address(vault), uint64(1), hex"bb"));
        deliverAction(4, abi.encode(address(vault), uint64(2), hex"bb"));
    }

    function test_decodesTheNoticeReportTheWorkflowEncodes() public view {
        (uint8 action, bytes memory args) = abi.decode(
            vm.parseBytes(vm.trim(vm.readFile("../workflows/agent/tests/fixtures/notice-report.hex"))), (uint8, bytes)
        );
        assertEq(action, executor.NOTICE());
        (address v, uint64 id, bytes memory sealedData) = abi.decode(args, (address, uint64, bytes));
        assertEq(v, address(uint160(0xa1)));
        assertEq(id, 5);
        assertEq(sealedData, hex"abcd");
    }
}
