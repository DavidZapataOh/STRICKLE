// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {BoxVault} from "../../src/vault/BoxVault.sol";
import {TestFeed} from "./TestFeed.sol";
import {TestToken} from "./TestToken.sol";

/// @dev Builds the implementation the way the deployment does, with two feeds the tests never need to move.
library Vaults {
    function newVault(TestToken usdc, TestToken eurc) internal returns (BoxVault) {
        return new BoxVault(
            address(usdc), address(eurc), address(new TestFeed(1e8)), address(new TestFeed(112_000_000)), 26 hours
        );
    }
}
