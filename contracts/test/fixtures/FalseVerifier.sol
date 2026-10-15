// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

/// @dev A verifier that answers `false` instead of reverting, to check the pool never treats that as success.
contract FalseVerifier {
    function verify(bytes calldata, bytes32[] calldata) external pure returns (bool) {
        return false;
    }
}
