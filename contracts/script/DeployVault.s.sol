// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Script} from "forge-std/Script.sol";
import {BoxVault} from "../src/vault/BoxVault.sol";
import {BoxVaultFactory} from "../src/vault/BoxVaultFactory.sol";
import {ReferenceFeed} from "../src/vault/ReferenceFeed.sol";

contract DeployVault is Script {
    address internal constant USDC = 0x3600000000000000000000000000000000000000;
    address internal constant EURC_TESTNET = 0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a;
    address internal constant EURC_MAINNET = 0xbEf5f6d51CB62b58e6A8f77868681825C6fe21c1;
    address internal constant USDC_FEED_MAINNET = 0x84EA90AC252Dc437031461836DB5164219147905;
    address internal constant EURC_FEED_MAINNET = 0x361b95c10b76Ca3f35C686d423e43A951755Bf23;
    uint32 internal constant MAINNET_FEED_AGE = 26 hours;
    uint32 internal constant TESTNET_FEED_AGE = 30 days;

    function run() external returns (BoxVault implementation, BoxVaultFactory factory) {
        bool testnet = block.chainid == 5042002;
        if (!testnet) _checkMainnetFeeds();
        vm.startBroadcast(vm.envUint("PRIVATE_KEY"));
        address usdcFeed = USDC_FEED_MAINNET;
        address eurcFeed = EURC_FEED_MAINNET;
        if (testnet) {
            // Arc testnet has no Chainlink directory: the owner keeps two reference feeds, set from the ECB rate
            ReferenceFeed usdc = new ReferenceFeed();
            ReferenceFeed eurc = new ReferenceFeed();
            usdc.set(1e8);
            uint256 eurcUsd = vm.envUint("EURC_USD_E8");
            require(eurcUsd >= 0.5e8 && eurcUsd <= 2e8, "EURC_USD_E8 out of range");
            eurc.set(int256(eurcUsd));
            usdcFeed = address(usdc);
            eurcFeed = address(eurc);
        }
        implementation = new BoxVault{salt: keccak256("strickle.box-vault.v2")}(
            USDC,
            testnet ? EURC_TESTNET : EURC_MAINNET,
            usdcFeed,
            eurcFeed,
            testnet ? TESTNET_FEED_AGE : MAINNET_FEED_AGE
        );
        factory = new BoxVaultFactory{salt: keccak256("strickle.box-vault-factory.v2")}(address(implementation));
        vm.stopBroadcast();
    }

    /// @dev The vault trusts these two proxies for every clone, so they are read before anything is deployed: both must
    /// answer a price near a dollar and fresh enough to pass the vault's own age limit.
    function _checkMainnetFeeds() internal view {
        _requireSane(USDC_FEED_MAINNET, 0.9e8, 1.1e8);
        _requireSane(EURC_FEED_MAINNET, 0.9e8, 1.4e8);
    }

    function _requireSane(address feed, int256 low, int256 high) internal view {
        (, int256 answer,, uint256 updatedAt,) = IFeed(feed).latestRoundData();
        require(answer >= low && answer <= high, "mainnet feed answer out of range");
        require(block.timestamp - updatedAt <= MAINNET_FEED_AGE, "mainnet feed is stale");
    }
}

interface IFeed {
    function latestRoundData() external view returns (uint80, int256, uint256, uint256, uint80);
}
