// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

/// @notice A Chainlink-shaped price feed the owner sets by hand. Arc testnet has no Chainlink directory, so test
/// deployments read the EUR price from this; the vault code is the same on both networks.
contract ReferenceFeed {
    uint8 public constant decimals = 8;

    address public immutable owner;
    int256 private answer;
    uint256 private updatedAt;

    error NotOwner();
    error NonPositive();

    constructor() {
        owner = msg.sender;
    }

    function set(int256 value) external {
        if (msg.sender != owner) revert NotOwner();
        if (value <= 0) revert NonPositive();
        answer = value;
        updatedAt = block.timestamp;
    }

    function latestRoundData() external view returns (uint80, int256, uint256, uint256, uint80) {
        return (1, answer, updatedAt, updatedAt, 1);
    }
}
