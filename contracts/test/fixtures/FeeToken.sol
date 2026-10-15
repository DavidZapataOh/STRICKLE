// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {TestToken} from "./TestToken.sol";

/// @dev A token that burns 1% of every transferFrom, so the pool receives less than it was told.
contract FeeToken is TestToken {
    function transferFrom(address from, address to, uint256 amount) external override returns (bool) {
        allowance[from][msg.sender] -= amount;
        _move(from, to, amount - amount / 100);
        balanceOf[from] -= amount / 100;
        return true;
    }
}
