// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Test, Vm} from "forge-std/Test.sol";
import {ShieldVerifier} from "../../src/pool/verifiers/ShieldVerifier.sol";
import {SpendVerifier} from "../../src/pool/verifiers/SpendVerifier.sol";
import {IHonkVerifier} from "../../src/pool/IHonkVerifier.sol";
import {PolicyPool} from "../../src/pool/PolicyPool.sol";
import {NullifierSet} from "../../src/pool/NullifierSet.sol";
import {TestToken} from "../fixtures/TestToken.sol";
import {FeeToken} from "../fixtures/FeeToken.sol";
import {FalseVerifier} from "../fixtures/FalseVerifier.sol";
import {HostileToken} from "../fixtures/HostileToken.sol";

contract PolicyPoolFlowTest is Test {
    string internal json;
    uint256 internal scenarioNow;
    address internal alice;
    address internal bob;
    address internal carol;
    address internal owner = makeAddr("owner");
    address internal guardian = makeAddr("guardian");

    PolicyPool internal pool;
    TestToken internal usdc;
    TestToken internal eurc;
    IHonkVerifier internal shieldVerifier;
    IHonkVerifier internal spendVerifier;
    uint256 internal emptyRoot;

    function setUp() public {
        json = vm.readFile("test/fixtures/pool/scenario.json");
        scenarioNow = vm.parseJsonUint(json, ".now");
        alice = vm.parseJsonAddress(json, ".depositor");
        bob = vm.parseJsonAddress(json, ".bob");
        carol = vm.parseJsonAddress(json, ".carol");
        assertEq(alice, makeAddr("alice"));
        assertEq(bob, makeAddr("bob"));
        assertEq(carol, makeAddr("carol"));

        shieldVerifier = IHonkVerifier(address(new ShieldVerifier()));
        spendVerifier = IHonkVerifier(address(new SpendVerifier()));
        usdc = new TestToken();
        eurc = new TestToken();
        pool = _deploy(address(usdc));
        emptyRoot = pool.currentRoot();
        vm.warp(scenarioNow);
        _fund(alice, usdc, pool);
    }

    function _deploy(address usdcToken) internal returns (PolicyPool) {
        return new PolicyPool(
            PolicyPool.Config({
                usdc: usdcToken,
                eurc: address(eurc),
                shieldVerifier: shieldVerifier,
                spendVerifier: spendVerifier,
                owner: owner,
                guardian: guardian,
                perUserCaps: [uint128(2_000e6), uint128(500e6)],
                globalCaps: [uint128(10_000e6), uint128(5_000e6)]
            })
        );
    }

    function _fund(address who, TestToken token, PolicyPool target) internal {
        token.mint(who, 5_000e6);
        vm.prank(who);
        token.approve(address(target), type(uint256).max);
    }

    function _key(uint256 i, string memory field) internal pure returns (string memory) {
        return string.concat(".spends[", vm.toString(i), "]", field);
    }

    function _proof(uint256 i) internal view returns (bytes memory) {
        return vm.parseJsonBytes(json, _key(i, ".proof"));
    }

    function _ciphertext(uint256 i) internal view returns (bytes memory) {
        return vm.parseJsonBytes(json, _key(i, ".ciphertext"));
    }

    function _inputs(uint256 i) internal view returns (PolicyPool.SpendInputs memory p) {
        p.root = vm.parseJsonUint(json, _key(i, ".inputs.root"));
        uint256[] memory nullifiers = vm.parseJsonUintArray(json, _key(i, ".inputs.nullifiers"));
        uint256[] memory commitments = vm.parseJsonUintArray(json, _key(i, ".inputs.commitments"));
        p.nullifiers = [nullifiers[0], nullifiers[1]];
        p.commitments = [commitments[0], commitments[1]];
        p.publicAmount = uint64(vm.parseJsonUint(json, _key(i, ".inputs.publicAmount")));
        p.recipient = vm.parseJsonUint(json, _key(i, ".inputs.recipient"));
        p.asset = uint8(vm.parseJsonUint(json, _key(i, ".inputs.asset")));
        p.timestamp = uint64(vm.parseJsonUint(json, _key(i, ".inputs.timestamp")));
        p.associationRoot = vm.parseJsonUint(json, _key(i, ".inputs.associationRoot"));
    }

    function _shield(PolicyPool target, address who) internal returns (uint32) {
        vm.prank(who);
        return target.shield(
            1,
            vm.parseJsonUint(json, ".shield.amount"),
            vm.parseJsonUint(json, ".shield.commitment"),
            vm.parseJsonBytes(json, ".shield.proof"),
            vm.parseJsonBytes(json, ".shield.ciphertext")
        );
    }

    function _spend(uint256 i) internal returns (uint32) {
        return pool.spend(_proof(i), _inputs(i), _ciphertext(i));
    }

    function test_FullFlowShieldSplitPayAndPayAgain() public {
        bytes memory shieldProof = vm.parseJsonBytes(json, ".shield.proof");
        bytes memory shieldCiphertext = vm.parseJsonBytes(json, ".shield.ciphertext");
        uint256 shieldAmount = vm.parseJsonUint(json, ".shield.amount");
        uint256 shieldCommitment = vm.parseJsonUint(json, ".shield.commitment");
        vm.prank(alice);
        uint256 start = gasleft();
        uint32 shieldIndex = pool.shield(1, shieldAmount, shieldCommitment, shieldProof, shieldCiphertext);
        emit log_named_uint("shield gas", start - gasleft());
        assertEq(shieldIndex, 0);
        assertEq(usdc.balanceOf(address(pool)), 1_000e6);
        assertEq(pool.totalShielded(1), 1_000e6);
        assertEq(pool.shieldedBy(1, alice), 1_000e6);
        assertEq(pool.shieldNonce(alice), 1);
        assertEq(usdc.balanceOf(alice), 4_000e6);

        assertEq(_spendMeasured(0, "split gas"), 2);
        assertEq(usdc.balanceOf(address(pool)), 1_000e6);

        assertEq(_spend(1), 4);
        assertEq(usdc.balanceOf(address(pool)), 750e6);
        assertEq(usdc.balanceOf(bob), 250e6);

        assertEq(_spendMeasured(2, "pay gas"), 6);
        assertEq(usdc.balanceOf(address(pool)), 650e6);
        assertEq(usdc.balanceOf(carol), 100e6);

        assertEq(pool.totalShielded(1), 650e6);
        assertEq(usdc.balanceOf(address(pool)), pool.totalShielded(1));
        assertEq(pool.treeSize(), 8);
        for (uint256 i = 0; i < 3; i++) {
            PolicyPool.SpendInputs memory p = _inputs(i);
            assertTrue(pool.isSpent(p.nullifiers[0]));
            assertTrue(pool.isSpent(p.nullifiers[1]));
        }
    }

    function _spendMeasured(uint256 i, string memory label) internal returns (uint32 index) {
        bytes memory proof = _proof(i);
        PolicyPool.SpendInputs memory p = _inputs(i);
        bytes memory ciphertext = _ciphertext(i);
        uint256 start = gasleft();
        index = pool.spend(proof, p, ciphertext);
        emit log_named_uint(label, start - gasleft());
    }

    function test_EventsLetAWalletRebuildTheTree() public {
        vm.recordLogs();
        _shield(pool, alice);
        _spend(0);
        Vm.Log[] memory logs = vm.getRecordedLogs();
        bytes32 inserted = keccak256("NotesInserted(uint32,uint256,uint256,bytes)");
        uint256 seen;
        uint32[2] memory indexes;
        for (uint256 i = 0; i < logs.length; i++) {
            if (logs[i].topics[0] == inserted) {
                indexes[seen++] = uint32(uint256(logs[i].topics[1]));
            }
        }
        assertEq(seen, 2);
        assertEq(indexes[0], 0);
        assertEq(indexes[1], 2);
    }

    function test_ReplayingASpendFails() public {
        _shield(pool, alice);
        _spend(0);
        PolicyPool.SpendInputs memory p = _inputs(0);
        vm.expectRevert(abi.encodeWithSelector(NullifierSet.NullifierAlreadySpent.selector, p.nullifiers[0]));
        pool.spend(_proof(0), p, _ciphertext(0));
    }

    function test_ChangingAnyPublicFieldInvalidatesTheProof() public {
        _shield(pool, alice);
        bytes memory proof = _proof(0);
        bytes memory ciphertext = _ciphertext(0);
        vm.prank(owner);
        pool.setAssociationRoot(12345, true);

        PolicyPool.SpendInputs memory p = _inputs(0);
        p.publicAmount = 1;
        p.recipient = uint256(uint160(bob));
        vm.expectRevert(PolicyPool.InvalidProof.selector);
        pool.spend(proof, p, ciphertext);

        p = _inputs(0);
        p.asset = 2;
        vm.expectRevert(PolicyPool.InvalidProof.selector);
        pool.spend(proof, p, ciphertext);

        p = _inputs(0);
        p.timestamp -= 1;
        vm.expectRevert(PolicyPool.InvalidProof.selector);
        pool.spend(proof, p, ciphertext);

        p = _inputs(0);
        p.associationRoot = 12345;
        vm.expectRevert(PolicyPool.InvalidProof.selector);
        pool.spend(proof, p, ciphertext);

        p = _inputs(0);
        p.commitments[0] += 1;
        vm.expectRevert(PolicyPool.InvalidProof.selector);
        pool.spend(proof, p, ciphertext);

        p = _inputs(0);
        p.nullifiers[1] += 1;
        vm.expectRevert(PolicyPool.InvalidProof.selector);
        pool.spend(proof, p, ciphertext);

        p = _inputs(0);
        p.root = emptyRoot;
        vm.expectRevert(PolicyPool.InvalidProof.selector);
        pool.spend(proof, p, ciphertext);

        p = _inputs(0);
        bytes memory altered = _ciphertext(0);
        altered[0] = bytes1(uint8(altered[0]) ^ 1);
        vm.expectRevert(PolicyPool.InvalidProof.selector);
        pool.spend(proof, p, altered);
    }

    function test_AProofIsRejectedOutsideTheTimeWindow() public {
        _shield(pool, alice);
        vm.warp(scenarioNow + 601);
        vm.expectRevert(PolicyPool.StaleTimestamp.selector);
        _spend(0);
        vm.warp(scenarioNow - 1);
        vm.expectRevert(PolicyPool.StaleTimestamp.selector);
        _spend(0);
        vm.warp(scenarioNow + 600);
        _spend(0);
    }

    function test_ATokenRevertRevertsTheWholeSpend() public {
        _shield(pool, alice);
        _spend(0);
        usdc.setBlocked(bob, true);
        PolicyPool.SpendInputs memory p = _inputs(1);
        vm.expectRevert(PolicyPool.TransferFailed.selector);
        pool.spend(_proof(1), p, _ciphertext(1));
        assertFalse(pool.isSpent(p.nullifiers[0]));
        assertEq(pool.totalShielded(1), 1_000e6);
        usdc.setBlocked(bob, false);
        _spend(1);
        assertEq(usdc.balanceOf(bob), 250e6);
    }

    function test_ShieldIsBoundToTheDepositorAndItsNonce() public {
        address mallory = makeAddr("mallory");
        _fund(mallory, usdc, pool);
        vm.expectRevert(PolicyPool.InvalidProof.selector);
        _shield(pool, mallory);
        assertEq(pool.shieldNonce(mallory), 0);

        _shield(pool, alice);
        vm.expectRevert(PolicyPool.InvalidProof.selector);
        _shield(pool, alice);
    }

    function test_ATokenThatReentersDuringTheDepositCannotCallTheShieldAgain() public {
        HostileToken hostile = new HostileToken();
        PolicyPool target = _deploy(address(hostile));
        hostile.arm(
            address(target),
            abi.encodeCall(
                PolicyPool.shield,
                (
                    1,
                    vm.parseJsonUint(json, ".secondShield.amount"),
                    vm.parseJsonUint(json, ".secondShield.commitment"),
                    vm.parseJsonBytes(json, ".secondShield.proof"),
                    vm.parseJsonBytes(json, ".secondShield.ciphertext")
                )
            )
        );
        _fund(alice, hostile, target);
        _shield(target, alice);
        assertEq(hostile.attempts(), 1);
        assertFalse(hostile.reentered());
        assertEq(target.shieldNonce(alice), 1);
    }

    function test_ATokenThatReentersDuringThePayoutCannotSpendAgain() public {
        HostileToken hostile = new HostileToken();
        PolicyPool target = _deploy(address(hostile));
        _fund(alice, hostile, target);
        _shield(target, alice);
        target.spend(_proof(0), _inputs(0), _ciphertext(0));
        // The payout of the second spend tries to run the third spend inside it.
        hostile.arm(address(target), abi.encodeCall(PolicyPool.spend, (_proof(2), _inputs(2), _ciphertext(2))));
        target.spend(_proof(1), _inputs(1), _ciphertext(1));
        assertEq(hostile.attempts(), 1);
        assertFalse(hostile.reentered());
        assertFalse(target.isSpent(_inputs(2).nullifiers[0]));
    }

    function test_AVerifierAnsweringFalseIsNeverAccepted() public {
        PolicyPool target = new PolicyPool(
            PolicyPool.Config({
                usdc: address(usdc),
                eurc: address(eurc),
                shieldVerifier: IHonkVerifier(address(new FalseVerifier())),
                spendVerifier: IHonkVerifier(address(new FalseVerifier())),
                owner: owner,
                guardian: guardian,
                perUserCaps: [uint128(2_000e6), uint128(500e6)],
                globalCaps: [uint128(10_000e6), uint128(5_000e6)]
            })
        );
        _fund(alice, usdc, target);
        vm.expectRevert(PolicyPool.InvalidProof.selector);
        _shield(target, alice);
        PolicyPool.SpendInputs memory p = _inputs(0);
        p.root = target.currentRoot();
        vm.expectRevert(PolicyPool.InvalidProof.selector);
        target.spend(_proof(0), p, _ciphertext(0));
    }

    function test_SpendRejectsAnOversizedCiphertext() public {
        _shield(pool, alice);
        PolicyPool.SpendInputs memory p = _inputs(0);
        vm.expectRevert(PolicyPool.CiphertextTooLarge.selector);
        pool.spend(_proof(0), p, new bytes(2049));
    }

    function test_APausedPoolRejectsTheRealSpend() public {
        _shield(pool, alice);
        vm.prank(guardian);
        pool.pause();
        vm.expectRevert(PolicyPool.PoolPaused.selector);
        _spend(0);
        vm.prank(owner);
        pool.unpause();
        _spend(0);
    }

    function test_TheRealShieldRespectsTheCaps() public {
        vm.prank(owner);
        pool.lowerCaps(1, 999e6, 10_000e6);
        vm.expectRevert(PolicyPool.UserCapExceeded.selector);
        _shield(pool, alice);
        vm.prank(owner);
        pool.lowerCaps(1, 999e6, 999e6);
    }

    function _secondShield(PolicyPool target, address who) internal returns (uint32) {
        vm.prank(who);
        return target.shield(
            1,
            vm.parseJsonUint(json, ".secondShield.amount"),
            vm.parseJsonUint(json, ".secondShield.commitment"),
            vm.parseJsonBytes(json, ".secondShield.proof"),
            vm.parseJsonBytes(json, ".secondShield.ciphertext")
        );
    }

    function test_ThePerUserCapAccumulatesAcrossDeposits() public {
        vm.prank(owner);
        pool.lowerCaps(1, 1_400e6, 10_000e6);
        _shield(pool, alice);
        vm.expectRevert(PolicyPool.UserCapExceeded.selector);
        _secondShield(pool, alice);
        assertEq(pool.shieldedBy(1, alice), 1_000e6);
    }

    function test_TwoDepositsGetTwoDifferentLabelsAndBothSucceedUnderTheCaps() public {
        _shield(pool, alice);
        assertEq(_secondShield(pool, alice), 2);
        assertEq(pool.shieldNonce(alice), 2);
        assertEq(pool.totalShielded(1), 1_500e6);
    }

    function test_TheGlobalCapCountsWhatIsStillInsideThePool() public {
        vm.prank(owner);
        pool.lowerCaps(1, 2_000e6, 1_400e6);
        _shield(pool, alice);
        vm.expectRevert(PolicyPool.GlobalCapExceeded.selector);
        _secondShield(pool, alice);
    }

    function test_APoolRefusesATokenThatDeliversLessThanItWasTold() public {
        FeeToken fee = new FeeToken();
        PolicyPool target = _deploy(address(fee));
        _fund(alice, fee, target);
        vm.expectRevert(PolicyPool.TransferFailed.selector);
        _shield(target, alice);
        assertEq(target.treeSize(), 0);
    }

    function test_SpendRejectsNullifiersOutsideTheField() public {
        _shield(pool, alice);
        for (uint256 slot = 0; slot < 2; slot++) {
            PolicyPool.SpendInputs memory p = _inputs(0);
            p.nullifiers[slot] = pool.FIELD_MODULUS();
            vm.expectRevert(abi.encodeWithSelector(PoolTreeError.NotFieldElement.selector, pool.FIELD_MODULUS()));
            pool.spend(_proof(0), p, _ciphertext(0));
        }
    }
}

interface PoolTreeError {
    error NotFieldElement(uint256 value);
}
