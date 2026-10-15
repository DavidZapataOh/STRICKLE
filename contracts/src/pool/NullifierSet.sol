// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

/// @notice Registry of spent note nullifiers; a nullifier can be recorded once.
abstract contract NullifierSet {
    error NullifierAlreadySpent(uint256 nullifier);
    error DuplicateNullifier(uint256 nullifier);

    mapping(uint256 nullifier => bool spent) private spent;

    function isSpent(uint256 nullifier) public view returns (bool) {
        return spent[nullifier];
    }

    function _spend(uint256 nullifier) internal {
        if (spent[nullifier]) revert NullifierAlreadySpent(nullifier);
        spent[nullifier] = true;
    }

    function _spendPair(uint256 a, uint256 b) internal {
        if (a == b) revert DuplicateNullifier(a);
        _spend(a);
        _spend(b);
    }
}
