// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {TestToken} from "./TestToken.sol";

contract TestSwapAdapter {
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
    TestToken public immutable eurc;
    Mode public mode;
    /// @dev output units per input unit, 6 decimals: 892_857 is 1 / 1.12 (USDC to EURC at EURC = 1.12 USDC)
    uint256 public rate = 892_857;
    address public constant STRANGER = address(0xBEEF);

    constructor(TestToken usdc_, TestToken eurc_) {
        usdc = usdc_;
        eurc = eurc_;
    }

    function setMode(Mode value) external {
        mode = value;
    }

    function setRate(uint256 value) external {
        rate = value;
    }

    function payload(address tokenIn, uint256 amountIn) external view returns (bytes memory) {
        ExecuteParams memory params;
        TokenInput[] memory inputs = new TokenInput[](1);
        inputs[0] = TokenInput({permitType: 0, token: tokenIn, amount: amountIn, permitCalldata: ""});
        return abi.encodeWithSelector(this.execute.selector, params, inputs, bytes(""));
    }

    function execute(ExecuteParams calldata, TokenInput[] calldata inputs, bytes calldata) external payable {
        if (mode == Mode.Reverts) revert("adapter");
        TokenInput calldata input = inputs[0];
        TestToken tokenIn = TestToken(input.token);
        TestToken tokenOut = input.token == address(usdc) ? eurc : usdc;
        tokenIn.transferFrom(msg.sender, address(this), mode == Mode.Overspend ? input.amount * 2 : input.amount);
        uint256 out = (input.amount * rate) / 1e6;
        if (mode == Mode.Short) out = (out * 99) / 100;
        tokenOut.transfer(mode == Mode.ToStranger ? STRANGER : msg.sender, out);
    }
}
