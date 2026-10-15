// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Script} from "forge-std/Script.sol";
import {IHonkVerifier} from "../src/pool/IHonkVerifier.sol";
import {IPoseidon2} from "../src/pool/Poseidon2Hasher.sol";
import {PolicyPool} from "../src/pool/PolicyPool.sol";
import {IScreening} from "../src/pool/ScreeningRegistry.sol";

contract DeployPool is Script {
    address internal constant USDC = 0x3600000000000000000000000000000000000000;
    address internal constant EURC_TESTNET = 0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a;
    address internal constant EURC_MAINNET = 0xbEf5f6d51CB62b58e6A8f77868681825C6fe21c1;

    function run() external returns (PolicyPool pool) {
        uint256 key = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(key);
        address eurc = block.chainid == 5042002 ? EURC_TESTNET : EURC_MAINNET;
        bytes32 salt = vm.envOr("POOL_SALT", keccak256("strickle.policy-pool.v1"));

        PolicyPool.Config memory config = PolicyPool.Config({
            hasher: IPoseidon2(vm.envAddress("POSEIDON2_HASHER")),
            usdc: USDC,
            eurc: eurc,
            shieldVerifier: IHonkVerifier(vm.envAddress("SHIELD_VERIFIER")),
            spendVerifier: IHonkVerifier(vm.envAddress("SPEND_VERIFIER")),
            screening: IScreening(vm.envAddress("SCREENING_REGISTRY")),
            elevatedCapBps: uint16(vm.envOr("ELEVATED_CAP_BPS", uint256(2_500))),
            owner: deployer,
            guardian: deployer,
            perUserCaps: [
                uint128(vm.envOr("CAP_USER_USDC", uint256(1_000e6))), uint128(vm.envOr("CAP_USER_EURC", uint256(500e6)))
            ],
            globalCaps: [
                uint128(vm.envOr("CAP_GLOBAL_USDC", uint256(10_000e6))),
                uint128(vm.envOr("CAP_GLOBAL_EURC", uint256(5_000e6)))
            ]
        });

        vm.startBroadcast(key);
        pool = new PolicyPool{salt: salt}(config);
        vm.stopBroadcast();
    }
}
