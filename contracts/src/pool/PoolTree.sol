// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {IPoseidon2} from "./Poseidon2Hasher.sol";
import {PoolZeros} from "./PoolZeros.sol";

/// @notice Incremental Poseidon2 Merkle tree (depth 24) where every call appends two leaves.
abstract contract PoolTree {
    uint256 public constant DEPTH = 24;
    uint256 public constant ROOT_HISTORY = 128;
    uint256 internal constant LEAVES = 1 << 24;
    uint256 private constant P = 21888242871839275222246405745257275088548364400416034343698204186575808495617;

    error TreeFull();
    error NotFieldElement(uint256 value);
    error BadHasher();

    uint256 private constant ANCHOR = 0x038682aa1cb5ae4e0a3f13da432a95c77c5c111f6f030faf9cad641ce1ed7383;

    IPoseidon2 public immutable hasher;

    uint32 private nextLeafIndex;
    uint32 private rootCounter;
    uint256 private latestRoot;
    uint256[25] private filled;
    mapping(uint256 root => uint32 counter) private rootCounterOf;

    constructor(IPoseidon2 hasher_) {
        (bool ok, bytes memory result) = address(hasher_).staticcall(abi.encodeCall(IPoseidon2.hash2, (1, 2)));
        if (!ok || result.length != 32 || abi.decode(result, (uint256)) != ANCHOR) revert BadHasher();
        hasher = hasher_;
        uint256 emptyRoot = PoolZeros.table()[24];
        latestRoot = emptyRoot;
        rootCounter = 1;
        rootCounterOf[emptyRoot] = 1;
    }

    function FIELD_MODULUS() public pure returns (uint256) {
        return P;
    }

    function treeSize() public view returns (uint32) {
        return nextLeafIndex;
    }

    function currentRoot() public view returns (uint256) {
        return latestRoot;
    }

    function isKnownRoot(uint256 root) public view returns (bool) {
        uint32 counter = rootCounterOf[root];
        return counter != 0 && rootCounter - counter < ROOT_HISTORY;
    }

    function _insertPair(uint256 a, uint256 b) internal returns (uint32 index, uint256 root) {
        index = nextLeafIndex;
        if (index >= LEAVES) revert TreeFull();
        if (a >= P) revert NotFieldElement(a);
        if (b >= P) revert NotFieldElement(b);

        uint256[25] memory zeros = PoolZeros.table();
        uint256 node = hasher.hash2(a, b);
        uint256 position = uint256(index) >> 1;
        for (uint256 level = 1; level < DEPTH; ++level) {
            if (position & 1 == 0) {
                filled[level] = node;
                node = hasher.hash2(node, zeros[level]);
            } else {
                node = hasher.hash2(filled[level], node);
            }
            position >>= 1;
        }

        root = node;
        nextLeafIndex = index + 2;
        latestRoot = root;
        rootCounterOf[root] = ++rootCounter;
    }
}
