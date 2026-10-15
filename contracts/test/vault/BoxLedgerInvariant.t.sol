// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Test} from "forge-std/Test.sol";
import {BoxLedger} from "../../src/vault/BoxLedger.sol";
import {BoxVault} from "../../src/vault/BoxVault.sol";
import {BoxVaultFactory} from "../../src/vault/BoxVaultFactory.sol";
import {TestToken} from "../fixtures/TestToken.sol";

contract LedgerHandler is Test {
    BoxVault public vault;
    TestToken public usdc;
    address public owner;
    uint256 public deposited;
    uint256 public paidOut;
    address[3] internal payees = [address(0xA1), address(0xA2), address(0xA3)];

    constructor(BoxVault vault_, TestToken usdc_, address owner_) {
        vault = vault_;
        usdc = usdc_;
        owner = owner_;
    }

    function deposit(uint256 amount) external {
        amount = bound(amount, 1, 1_000e6);
        usdc.mint(address(vault), amount);
        deposited += amount;
    }

    function allocate(uint8 box, uint256 amount) external {
        box = uint8(bound(box, 1, 6));
        uint256 free = vault.unallocated(1);
        if (free == 0) return;
        amount = bound(amount, 1, free);
        uint8[] memory boxes = new uint8[](1);
        uint256[] memory amounts = new uint256[](1);
        boxes[0] = box;
        amounts[0] = amount;
        vm.prank(owner);
        vault.allocate(1, boxes, amounts);
    }

    function withdraw(uint8 box, uint256 amount, uint8 who) external {
        box = uint8(bound(box, 1, 6));
        uint256 balance = vault.boxBalance(1, box);
        if (balance == 0) return;
        amount = bound(amount, 1, balance);
        address to = payees[who % 3];
        vm.prank(owner);
        try vault.withdraw(1, box, amount, to) {
            paidOut += amount;
        } catch {}
    }

    function request(uint8 box, uint256 amount, uint8 who) external {
        box = uint8(bound(box, 1, 6));
        uint256 balance = vault.boxBalance(1, box);
        if (balance == 0) return;
        amount = bound(amount, 1, balance);
        vm.prank(owner);
        try vault.requestWithdrawal(1, box, amount, payees[who % 3]) {} catch {}
    }

    function execute(uint256 id) external {
        uint256 count = vault.nextRequestId();
        if (count == 0) return;
        id = bound(id, 0, count - 1);
        (,,, uint128 amount,, bool open) = vault.requests(id);
        vm.prank(owner);
        try vault.executeWithdrawal(id) {
            if (open) paidOut += amount;
        } catch {}
    }

    function cancel(uint256 id) external {
        uint256 count = vault.nextRequestId();
        if (count == 0) return;
        vm.prank(owner);
        try vault.cancelWithdrawal(bound(id, 0, count - 1)) {} catch {}
    }

    function changeRule(uint8 box, uint32 delay, bool always, bool restricted, uint128 floor, uint64 lockDays)
        external
    {
        box = uint8(bound(box, 1, 6));
        BoxLedger.Rule memory rule = BoxLedger.Rule(
            uint32(bound(delay, 0, 5 days)),
            always,
            restricted,
            uint128(bound(floor, 0, 500e6)),
            uint64(block.timestamp + bound(lockDays, 0, 3) * 1 days)
        );
        vm.prank(owner);
        try vault.setRule(box, rule) {} catch {}
    }

    function applyChange(uint8 box) external {
        vm.prank(owner);
        try vault.applyRuleChange(uint8(bound(box, 1, 6))) {} catch {}
    }

    function approve(uint8 box, uint8 who) external {
        vm.prank(owner);
        try vault.approveRecipient(uint8(bound(box, 1, 6)), payees[who % 3]) {} catch {}
    }

    function pass(uint256 seconds_) external {
        vm.warp(block.timestamp + bound(seconds_, 0, 4 days));
    }

    function sumBoxes() public view returns (uint256 total) {
        for (uint8 box = 1; box <= 6; ++box) {
            total += vault.boxBalance(1, box);
        }
    }

    function sumOpenRequests() public view returns (uint256 total) {
        uint256 count = vault.nextRequestId();
        for (uint256 id = 0; id < count; ++id) {
            (,,, uint128 amount,, bool open) = vault.requests(id);
            if (open) total += amount;
        }
    }
}

contract BoxLedgerInvariantTest is Test {
    LedgerHandler internal handler;
    BoxVault internal vault;
    TestToken internal usdc;

    function setUp() public {
        vm.warp(1_900_000_000);
        usdc = new TestToken();
        BoxVaultFactory factory = new BoxVaultFactory(address(new BoxVault(address(usdc), address(new TestToken()))));
        address owner = makeAddr("owner");
        vault = BoxVault(factory.create(owner));
        handler = new LedgerHandler(vault, usdc, owner);
        targetContract(address(handler));
    }

    function invariant_HeldFundsAreExactlyTheBoxesPlusOpenRequests() public view {
        assertEq(vault.held(1), handler.sumBoxes() + handler.sumOpenRequests());
    }

    function invariant_TheVaultAlwaysHoldsWhatItOwes() public view {
        assertGe(usdc.balanceOf(address(vault)), vault.held(1));
    }

    function invariant_NothingIsCreatedOrLost() public view {
        assertEq(usdc.balanceOf(address(vault)) + handler.paidOut(), handler.deposited());
    }
}
