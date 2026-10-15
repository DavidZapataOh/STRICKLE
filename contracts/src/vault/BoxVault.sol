// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {BoxLedger} from "./BoxLedger.sol";

/// @notice One vault per user, deployed as a minimal proxy by `BoxVaultFactory`.
contract BoxVault is BoxLedger {
    constructor(address usdc, address eurc) BoxLedger(usdc, eurc) {}
}
