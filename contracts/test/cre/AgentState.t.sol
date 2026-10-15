// contracts/test/cre/AgentState.t.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Test} from "forge-std/Test.sol";
import {AgentState} from "../../src/cre/AgentState.sol";
import {CreReceiver} from "../../src/cre/CreReceiver.sol";

contract OwnedVault {
    address public owner;

    constructor(address owner_) {
        owner = owner_;
    }
}

contract AgentStateTest is Test {
    address forwarder = makeAddr("forwarder");
    address deployer = makeAddr("deployer");
    address user = makeAddr("user");
    bytes32 workflow = keccak256("strickle-agent");
    AgentState state;
    OwnedVault vault;

    function setUp() public {
        state = new AgentState(forwarder, deployer);
        vm.prank(deployer);
        state.setExpectedWorkflowId(workflow);
        vault = new OwnedVault(user);
    }

    function deliver(uint64 next, uint64 profileApplied, bytes memory ciphertext) internal {
        bytes memory meta = new bytes(64);
        bytes32 id = workflow;
        assembly ("memory-safe") {
            mstore(add(meta, 32), id)
        }
        vm.prank(forwarder);
        state.onReport(meta, abi.encode(address(vault), next, profileApplied, ciphertext));
    }

    function test_onlyTheVaultOwnerSubmitsAProfileAndItTravelsInTheEvent() public {
        vm.expectRevert(AgentState.NotVaultOwner.selector);
        state.submitProfile(address(vault), hex"01");

        vm.expectEmit(true, true, false, true);
        emit AgentState.ProfileSubmitted(address(vault), 1, hex"0102");
        vm.prank(user);
        state.submitProfile(address(vault), hex"0102");
        assertEq(state.profileId(address(vault)), 1);
    }

    function test_aProfileOverTheCapIsRefused() public {
        vm.prank(user);
        vm.expectRevert(AgentState.ProfileTooLarge.selector);
        state.submitProfile(address(vault), new bytes(4_801));
    }

    function test_onlyTheDeployerSetsTheEnclaveKey() public {
        vm.expectRevert(CreReceiver.NotOwner.selector);
        state.setEnclaveKey(bytes32(uint256(7)));
        vm.prank(deployer);
        state.setEnclaveKey(bytes32(uint256(7)));
        assertEq(state.enclaveKey(), bytes32(uint256(7)));
    }

    function test_aReportPublishesTheCiphertextAsAnEventAndMovesTheHead() public {
        vm.expectEmit(true, true, false, true);
        emit AgentState.StateUpdated(address(vault), 1, hex"c0de");
        deliver(1, 1, hex"c0de");
        (uint64 version, uint64 updatedAt, uint64 applied) = state.head(address(vault));
        assertEq(version, 1);
        assertEq(updatedAt, block.number);
        assertEq(applied, 1);
    }

    function test_aReportBuiltOnAStaleVersionIsRefused() public {
        deliver(1, 1, hex"01");
        vm.expectRevert(abi.encodeWithSelector(AgentState.StaleVersion.selector, uint64(2), uint64(1)));
        deliver(1, 0, hex"02");
        vm.expectRevert(abi.encodeWithSelector(AgentState.StaleVersion.selector, uint64(2), uint64(3)));
        deliver(3, 0, hex"02");
    }

    function test_theSameProfileEventTwiceDoesNotBumpTheVersion() public {
        deliver(1, 1, hex"01");
        deliver(2, 1, hex"02");
        (uint64 version,,) = state.head(address(vault));
        assertEq(version, 1);
    }

    function test_aStateOverTheCapIsRefused() public {
        vm.expectRevert(AgentState.StateTooLarge.selector);
        deliver(1, 1, new bytes(16_385));
    }

    function test_onlyTheExecutorStoresAndItUsesTheSameVersionLock() public {
        address executor = makeAddr("executor");
        vm.expectRevert(CreReceiver.NotOwner.selector);
        state.setExecutor(executor);
        vm.prank(deployer);
        state.setExecutor(executor);

        vm.expectRevert(AgentState.NotExecutor.selector);
        state.store(address(vault), 1, hex"01");

        vm.prank(executor);
        state.store(address(vault), 1, hex"01");
        (uint64 version,,) = state.head(address(vault));
        assertEq(version, 1);

        vm.prank(executor);
        vm.expectRevert(abi.encodeWithSelector(AgentState.StaleVersion.selector, uint64(2), uint64(1)));
        state.store(address(vault), 1, hex"02");
    }

    function test_onlyTheExecutorNotifiesAndNoticesAreSequential() public {
        address executor = makeAddr("executor");
        vm.prank(deployer);
        state.setExecutor(executor);

        vm.expectRevert(AgentState.NotExecutor.selector);
        state.notify(address(vault), 1, hex"aa");

        vm.expectEmit(true, true, false, true);
        emit AgentState.Notice(address(vault), 1, hex"aa");
        vm.prank(executor);
        state.notify(address(vault), 1, hex"aa");
        assertEq(state.noticeCount(address(vault)), 1);

        vm.prank(executor);
        vm.expectRevert(abi.encodeWithSelector(AgentState.StaleNotice.selector, uint64(2), uint64(1)));
        state.notify(address(vault), 1, hex"bb");
    }

    function test_aNoticeOverTheCapIsRefused() public {
        address executor = makeAddr("executor");
        vm.prank(deployer);
        state.setExecutor(executor);
        vm.prank(executor);
        vm.expectRevert(AgentState.NoticeTooLarge.selector);
        state.notify(address(vault), 1, new bytes(4_097));
    }

    function test_aStateUpdateStaysCheap() public {
        bytes memory ciphertext = new bytes(2_000);
        uint256 before = gasleft();
        deliver(1, 1, ciphertext);
        assertLt(before - gasleft(), 120_000);
    }
}
