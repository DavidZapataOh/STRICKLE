// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

contract TestFeed {
    int256 public answer;
    uint256 public updatedAt;
    uint8 public constant decimals = 8;

    constructor(int256 initial) {
        answer = initial;
        updatedAt = block.timestamp;
    }

    function setAnswer(int256 value) external {
        answer = value;
    }

    function touch() external {
        updatedAt = block.timestamp;
    }

    function latestRoundData() external view returns (uint80, int256, uint256, uint256, uint80) {
        return (1, answer, updatedAt, updatedAt, 1);
    }
}
