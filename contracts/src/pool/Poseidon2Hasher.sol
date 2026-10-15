// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {LibPoseidon2Yul} from "poseidon2-evm/src/bn254/yul/LibPoseidon2Yul.sol";

interface IPoseidon2 {
    function hash2(uint256 a, uint256 b) external view returns (uint256);
}

/// @notice The Poseidon2 hash of two field elements (the tree node hash), deployed once and shared.
/// It lives in its own contract because the unrolled permutation is 16 KB and the pool would
/// otherwise exceed the 24,576-byte contract size limit.
contract Poseidon2Hasher is IPoseidon2 {
    function hash2(uint256 a, uint256 b) external pure returns (uint256) {
        return LibPoseidon2Yul.hash_2(a, b);
    }
}
