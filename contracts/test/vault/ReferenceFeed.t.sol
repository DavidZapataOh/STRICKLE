// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Test} from "forge-std/Test.sol";
import {ReferenceFeed} from "../../src/vault/ReferenceFeed.sol";

contract ReferenceFeedTest is Test {
    ReferenceFeed feed;
    address stranger = makeAddr("stranger");

    function setUp() public {
        vm.warp(1_900_000_000);
        feed = new ReferenceFeed();
    }

    function test_OnlyTheOwnerSetsAndTheAnswerMustBePositive() public {
        vm.prank(stranger);
        vm.expectRevert(ReferenceFeed.NotOwner.selector);
        feed.set(1e8);
        vm.expectRevert(ReferenceFeed.NonPositive.selector);
        feed.set(0);
        vm.expectRevert(ReferenceFeed.NonPositive.selector);
        feed.set(-1);
    }

    function test_ReturnsTheChainlinkTupleStampedWithTheBlockTime() public {
        feed.set(112_353_511);
        (uint80 round, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredIn) = feed.latestRoundData();
        assertEq(round, 1);
        assertEq(answer, 112_353_511);
        assertEq(startedAt, block.timestamp);
        assertEq(updatedAt, block.timestamp);
        assertEq(answeredIn, 1);
        assertEq(feed.decimals(), 8);
    }
}
