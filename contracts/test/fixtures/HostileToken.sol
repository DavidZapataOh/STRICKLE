// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {TestToken} from "./TestToken.sol";

interface IShield {
    function shield(uint8 asset, uint256 amount, uint256 commitment, bytes calldata proof, bytes calldata ciphertext)
        external
        returns (uint32);
}

/// @dev A token whose transferFrom tries to re-enter the pool, as a malicious token or hook would.
contract HostileToken is TestToken {
    IShield public target;
    bool public reentered;

    function arm(IShield pool) external {
        target = pool;
    }

    function transferFrom(address from, address to, uint256 amount) external override returns (bool) {
        if (address(target) != address(0)) {
            try target.shield(1, 1, 1, "", "") returns (uint32) {
                reentered = true;
            } catch {}
        }
        allowance[from][msg.sender] -= amount;
        return _move(from, to, amount);
    }
}
