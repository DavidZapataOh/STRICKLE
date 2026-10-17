// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {TestToken} from "./TestToken.sol";
import {TestVault4626} from "./TestVault4626.sol";

/// @dev Circle's Adapter as the Earn flow uses it: `execute` pulls the input token from the caller, deposits into (or redeems from) the yield vault and hands the output to the caller. The signature is the real one, so the selector is the verified 0xaa3e079c.
contract TestEarnAdapter {
    enum Mode {
        Honest,
        Short,
        ToStranger,
        Overspend,
        Reverts
    }

    struct Instruction {
        address target;
        bytes data;
        uint256 value;
        address tokenIn;
        uint256 amountToApprove;
        address tokenOut;
        uint256 minTokenOut;
    }

    struct TokenBeneficiary {
        address token;
        address beneficiary;
    }

    struct ExecuteParams {
        Instruction[] instructions;
        TokenBeneficiary[] tokens;
        uint256 execId;
        uint256 deadline;
        bytes metadata;
    }

    struct TokenInput {
        uint8 permitType;
        address token;
        uint256 amount;
        bytes permitCalldata;
    }

    TestToken public immutable usdc;
    TestVault4626 public immutable yield;
    Mode public mode;
    address public constant STRANGER = address(0xBEEF);

    constructor(TestToken usdc_, TestVault4626 yield_) {
        usdc = usdc_;
        yield = yield_;
    }

    function setMode(Mode value) external {
        mode = value;
    }

    function payload(address tokenIn, uint256 amountIn) external pure returns (bytes memory) {
        ExecuteParams memory params;
        TokenInput[] memory inputs = new TokenInput[](1);
        inputs[0] = TokenInput({permitType: 0, token: tokenIn, amount: amountIn, permitCalldata: ""});
        return abi.encodeWithSelector(this.execute.selector, params, inputs, bytes(""));
    }

    function execute(ExecuteParams calldata, TokenInput[] calldata inputs, bytes calldata) external payable {
        if (mode == Mode.Reverts) revert("adapter");
        TokenInput calldata input = inputs[0];
        uint256 amount = mode == Mode.Overspend ? input.amount * 2 : input.amount;
        address to = mode == Mode.ToStranger ? STRANGER : msg.sender;
        if (input.token == address(usdc)) {
            usdc.transferFrom(msg.sender, address(this), amount);
            usdc.approve(address(yield), amount);
            uint256 shares = yield.deposit(amount, address(this));
            yield.transfer(to, mode == Mode.Short ? (shares * 99) / 100 : shares);
        } else {
            yield.transferFrom(msg.sender, address(this), amount);
            uint256 assets = yield.redeem(amount, address(this), address(this));
            usdc.transfer(to, mode == Mode.Short ? (assets * 99) / 100 : assets);
        }
    }
}
