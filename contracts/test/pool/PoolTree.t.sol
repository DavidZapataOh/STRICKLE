// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Test} from "forge-std/Test.sol";
import {LibPoseidon2Yul} from "poseidon2-evm/src/bn254/yul/LibPoseidon2Yul.sol";
import {PoolTree} from "../../src/pool/PoolTree.sol";
import {PoolZeros} from "../../src/pool/PoolZeros.sol";

contract PoolTreeHarness is PoolTree {
    function insertPair(uint256 a, uint256 b) external returns (uint32, uint256) {
        return _insertPair(a, b);
    }
}

contract PoolTreeTest is Test {
    PoolTreeHarness internal tree;
    string internal vectors;

    function setUp() public {
        tree = new PoolTreeHarness();
        vectors = vm.readFile("../packages/pool/vectors/pool-vectors.json");
    }

    function _bytes32At(string memory path) internal view returns (uint256) {
        return uint256(vm.parseJsonBytes32(vectors, path));
    }

    function test_ZerosMatchTheSharedVectors() public view {
        uint256[25] memory zeros = PoolZeros.table();
        for (uint256 i; i < 25; ++i) {
            assertEq(zeros[i], _bytes32At(string.concat(".merkle.zeros[", vm.toString(i), "]")), "zero level");
        }
    }

    function test_EmptyTreeRootIsKnownAndIsTheTopZero() public view {
        assertEq(tree.treeSize(), 0);
        assertEq(tree.currentRoot(), PoolZeros.table()[24]);
        assertTrue(tree.isKnownRoot(tree.currentRoot()));
    }

    function test_RootsMatchTheTypeScriptTreeAfterEveryPair() public {
        for (uint256 i; i < 70; ++i) {
            string memory base = string.concat(".merkle.pairs[", vm.toString(i), "]");
            (uint32 index, uint256 root) =
                tree.insertPair(_bytes32At(string.concat(base, ".a")), _bytes32At(string.concat(base, ".b")));
            assertEq(index, uint32(2 * i), "index");
            assertEq(root, _bytes32At(string.concat(base, ".root")), "root");
            assertEq(tree.currentRoot(), root);
        }
        assertEq(tree.treeSize(), 140);
    }

    function _naiveRoot(uint256[] memory leaves) internal pure returns (uint256) {
        uint256[25] memory zeros = PoolZeros.table();
        uint256[] memory level = leaves;
        for (uint256 height; height < 24; ++height) {
            uint256 count = level.length == 0 ? 1 : (level.length + 1) / 2;
            uint256[] memory next = new uint256[](count);
            for (uint256 i; i < count; ++i) {
                uint256 left = 2 * i < level.length ? level[2 * i] : zeros[height];
                uint256 right = 2 * i + 1 < level.length ? level[2 * i + 1] : zeros[height];
                next[i] = LibPoseidon2Yul.hash_2(left, right);
            }
            level = next;
        }
        return level[0];
    }

    function testFuzz_IncrementalRootEqualsNaiveRecomputation(uint256 seed, uint8 pairCount) public {
        uint256 pairs = bound(pairCount, 1, 12);
        uint256[] memory leaves = new uint256[](pairs * 2);
        for (uint256 i; i < leaves.length; ++i) {
            // include repeated values and the zero leaf on purpose
            uint256 pick = uint256(keccak256(abi.encode(seed, i))) % 4;
            leaves[i] = pick == 0
                ? 0
                : pick == 1
                    ? uint256(keccak256(abi.encode(seed))) % tree.FIELD_MODULUS()
                    : uint256(keccak256(abi.encode(seed, i, "x"))) % tree.FIELD_MODULUS();
        }
        uint256 last;
        for (uint256 i; i < pairs; ++i) {
            (, last) = tree.insertPair(leaves[2 * i], leaves[2 * i + 1]);
        }
        assertEq(last, _naiveRoot(leaves));
    }

    function test_RejectsValuesThatAreNotFieldElements() public {
        uint256 p = tree.FIELD_MODULUS();
        vm.expectRevert(abi.encodeWithSelector(PoolTree.NotFieldElement.selector, p));
        tree.insertPair(p, 1);
        vm.expectRevert(abi.encodeWithSelector(PoolTree.NotFieldElement.selector, p + 5));
        tree.insertPair(1, p + 5);
    }

    function test_OldRootsExpireAfterTheHistoryWindow() public {
        (, uint256 first) = tree.insertPair(1, 2);
        assertTrue(tree.isKnownRoot(first));
        for (uint256 i; i < tree.ROOT_HISTORY() - 1; ++i) {
            tree.insertPair(i + 10, i + 11);
        }
        assertTrue(tree.isKnownRoot(first), "still inside the window");
        tree.insertPair(1000, 1001);
        assertFalse(tree.isKnownRoot(first), "expired");
        assertTrue(tree.isKnownRoot(tree.currentRoot()));
    }

    function test_UnknownRootsAreRejected() public {
        tree.insertPair(1, 2);
        assertFalse(tree.isKnownRoot(0));
        assertFalse(tree.isKnownRoot(123456789));
    }

    function test_TheLastPairFitsAndTheNextOneReverts() public {
        // nextLeafIndex is the first slot after the constants; set it to the second-to-last pair.
        vm.store(address(tree), bytes32(uint256(0)), bytes32(uint256((1 << 24) - 2)));
        tree.insertPair(1, 2);
        assertEq(tree.treeSize(), 1 << 24);
        vm.expectRevert(PoolTree.TreeFull.selector);
        tree.insertPair(3, 4);
    }

    function test_GasOfOnePairInsertIsReported() public {
        uint256 before = gasleft();
        tree.insertPair(1, 2);
        uint256 used = before - gasleft();
        emit log_named_uint("gas: first insertPair (cold)", used);
        before = gasleft();
        tree.insertPair(3, 4);
        used = before - gasleft();
        emit log_named_uint("gas: second insertPair", used);
        assertLt(used, 700_000, "insert budget");
    }
}
