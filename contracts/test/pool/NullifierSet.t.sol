// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Test} from "forge-std/Test.sol";
import {NullifierSet} from "../../src/pool/NullifierSet.sol";

contract NullifierHarness is NullifierSet {
    function spend(uint256 n) external {
        _spend(n);
    }

    function spendPair(uint256 a, uint256 b) external {
        _spendPair(a, b);
    }
}

contract NullifierSetTest is Test {
    NullifierHarness internal set;

    function setUp() public {
        set = new NullifierHarness();
    }

    function testFuzz_ANullifierCanBeSpentOnlyOnce(uint256 n) public {
        assertFalse(set.isSpent(n));
        set.spend(n);
        assertTrue(set.isSpent(n));
        vm.expectRevert(abi.encodeWithSelector(NullifierSet.NullifierAlreadySpent.selector, n));
        set.spend(n);
    }

    function testFuzz_APairIsRecordedTogetherAndNeverTwice(uint256 a, uint256 b) public {
        vm.assume(a != b);
        set.spendPair(a, b);
        assertTrue(set.isSpent(a));
        assertTrue(set.isSpent(b));
        vm.expectRevert(abi.encodeWithSelector(NullifierSet.NullifierAlreadySpent.selector, a));
        set.spendPair(a, b);
    }

    function testFuzz_APairWithTheSameNullifierTwiceReverts(uint256 n) public {
        vm.expectRevert(abi.encodeWithSelector(NullifierSet.DuplicateNullifier.selector, n));
        set.spendPair(n, n);
        assertFalse(set.isSpent(n), "nothing recorded by a reverted call");
    }

    function testFuzz_ASpentNullifierBlocksAPairContainingIt(uint256 a, uint256 b) public {
        vm.assume(a != b);
        set.spend(a);
        vm.expectRevert(abi.encodeWithSelector(NullifierSet.NullifierAlreadySpent.selector, a));
        set.spendPair(b, a);
        assertFalse(set.isSpent(b), "atomic: the other nullifier is not recorded");
    }

    function testFuzz_DifferentNullifiersDoNotInterfere(uint256 a, uint256 b) public {
        vm.assume(a != b);
        set.spend(a);
        assertFalse(set.isSpent(b));
        set.spend(b);
    }
}
