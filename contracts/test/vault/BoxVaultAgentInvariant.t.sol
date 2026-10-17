// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Test} from "forge-std/Test.sol";
import {BoxVault} from "../../src/vault/BoxVault.sol";
import {BoxVaultFactory} from "../../src/vault/BoxVaultFactory.sol";
import {TestToken} from "../fixtures/TestToken.sol";
import {TestVault4626} from "../fixtures/TestVault4626.sol";
import {Vaults} from "../fixtures/Vaults.sol";

contract AgentHandler is Test {
    BoxVault public vault;
    TestToken public usdc;
    TestVault4626 public yield;
    address public owner;
    address public agent;
    uint256 public deposited;
    uint256 public donated;
    uint256 public slashed;
    uint256 public paidByAgent;
    uint256 public paidByOwner;
    uint256 public paidToUnapproved;
    address[3] internal payees = [address(0xB1), address(0xB2), address(0xB3)];

    constructor(BoxVault vault_, TestToken usdc_, TestVault4626 yield_, address owner_, address agent_) {
        vault = vault_;
        usdc = usdc_;
        yield = yield_;
        owner = owner_;
        agent = agent_;
    }

    function deposit(uint256 amount) external {
        amount = bound(amount, 1, 2_000e6);
        usdc.mint(address(vault), amount);
        deposited += amount;
    }

    function split(uint8 box, uint256 amount) external {
        uint256 free = vault.unallocated(1);
        if (free == 0) return;
        uint8[] memory boxes = new uint8[](1);
        uint256[] memory amounts = new uint256[](1);
        boxes[0] = uint8(bound(box, 1, 6));
        amounts[0] = bound(amount, 1, free);
        vm.prank(agent);
        try vault.split(1, boxes, amounts) {} catch {}
    }

    function agentPays(uint8 box, uint256 amount, uint8 who) external {
        box = uint8(bound(box, 1, 6));
        address to = payees[who % 3];
        amount = bound(amount, 1, 600e6);
        bool approved = vault.isApproved(box, to);
        vm.prank(agent);
        try vault.payAllowlisted(1, box, to, amount) {
            paidByAgent += amount;
            if (!approved) paidToUnapproved += amount;
        } catch {}
    }

    function approveRecipient(uint8 box, uint8 who) external {
        vm.prank(owner);
        try vault.approveRecipient(uint8(bound(box, 1, 6)), payees[who % 3]) {} catch {}
    }

    function sweep(uint8 box, uint256 amount) external {
        box = uint8(bound(box, 1, 6));
        uint256 balance = vault.boxBalance(1, box);
        if (balance == 0) return;
        vm.prank(agent);
        try vault.sweepToVault(1, box, address(yield), bound(amount, 1, balance)) {} catch {}
    }

    function redeem(uint8 box, uint256 shares, bool asOwner) external {
        box = uint8(bound(box, 1, 6));
        uint256 owned = vault.sharesOf(address(yield), box);
        if (owned == 0) return;
        vm.prank(asOwner ? owner : agent);
        try vault.redeem(1, box, address(yield), bound(shares, 1, owned)) {} catch {}
    }

    function yieldMoves(uint256 amount, bool gain) external {
        if (gain) {
            amount = bound(amount, 0, 200e6);
            yield.donate(amount);
            donated += amount;
        } else {
            uint256 assets = yield.totalAssets();
            if (assets == 0) return;
            amount = bound(amount, 0, assets / 2);
            yield.slash(amount);
            slashed += amount;
        }
    }

    function ownerPays(uint8 box, uint256 amount, uint8 who) external {
        box = uint8(bound(box, 1, 6));
        uint256 balance = vault.boxBalance(1, box);
        if (balance == 0) return;
        amount = bound(amount, 1, balance);
        vm.prank(owner);
        try vault.withdraw(1, box, amount, payees[who % 3]) {
            paidByOwner += amount;
        } catch {}
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
}

contract BoxVaultAgentInvariantTest is Test {
    AgentHandler internal handler;
    BoxVault internal vault;
    TestToken internal usdc;
    TestVault4626 internal yield;

    function setUp() public {
        vm.warp(1_900_000_000);
        usdc = new TestToken();
        yield = new TestVault4626(usdc);
        BoxVaultFactory factory = new BoxVaultFactory(address(Vaults.newVault(usdc, new TestToken())));
        address owner = makeAddr("owner");
        address agent = makeAddr("agent");
        vault = BoxVault(factory.create(owner));
        vm.startPrank(owner);
        vault.setAgent(agent, 500e6, 1 days);
        vault.approveVault(address(yield));
        vm.stopPrank();
        vm.warp(block.timestamp + 2 days);
        handler = new AgentHandler(vault, usdc, yield, owner, agent);
        targetContract(address(handler));
    }

    function invariant_TheVaultAlwaysHoldsWhatItOwes() public view {
        assertGe(usdc.balanceOf(address(vault)), vault.held(1));
    }

    function invariant_HeldFundsAreExactlyTheBoxes() public view {
        assertEq(vault.held(1), handler.sumBoxes());
    }

    function invariant_TheAgentNeverPaysAnAddressTheOwnerHasNotApproved() public view {
        assertEq(handler.paidToUnapproved(), 0);
    }

    function invariant_TheCapWindowNeverOverflows() public view {
        assertLe(vault.windowSpent(), vault.agentCap());
    }

    function invariant_ValueIsConservedAcrossTheVaultTheYieldVaultAndPayments() public view {
        uint256 inside = usdc.balanceOf(address(vault)) + yield.totalAssets();
        assertEq(
            inside + handler.paidByAgent() + handler.paidByOwner() + handler.slashed(),
            handler.deposited() + handler.donated()
        );
    }
}
