// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Test} from "forge-std/Test.sol";
import {ShieldVerifier} from "../../src/pool/verifiers/ShieldVerifier.sol";
import {SpendVerifier} from "../../src/pool/verifiers/SpendVerifier.sol";

interface IHonk {
    function verify(bytes calldata proof, bytes32[] calldata publicInputs) external view returns (bool);
}

contract VerifiersTest is Test {
    uint256 internal constant FIELD_MODULUS =
        21888242871839275222246405745257275088548364400416034343698204186575808495617;
    uint256 internal constant EIP170_LIMIT = 24_576;

    IHonk internal shield;
    IHonk internal spend;

    function setUp() public {
        shield = IHonk(address(new ShieldVerifier()));
        spend = IHonk(address(new SpendVerifier()));
    }

    function _load(string memory name) internal view returns (bytes memory proof, bytes32[] memory inputs) {
        string memory base = string.concat("test/fixtures/proofs/", name);
        proof = vm.readFileBinary(string.concat(base, ".proof"));
        bytes memory raw = vm.readFileBinary(string.concat(base, ".inputs"));
        inputs = new bytes32[](raw.length / 32);
        for (uint256 i = 0; i < inputs.length; i++) {
            bytes32 word;
            assembly {
                word := mload(add(add(raw, 32), mul(i, 32)))
            }
            inputs[i] = word;
        }
    }

    function test_ShieldProofVerifies() public view {
        (bytes memory proof, bytes32[] memory inputs) = _load("shield");
        assertEq(inputs.length, 4);
        assertTrue(shield.verify(proof, inputs));
    }

    function test_SpendProofVerifies() public view {
        (bytes memory proof, bytes32[] memory inputs) = _load("spend");
        assertEq(inputs.length, 13);
        assertTrue(spend.verify(proof, inputs));
    }

    function test_GasOfAVerification() public {
        (bytes memory proof, bytes32[] memory inputs) = _load("spend");
        uint256 before = gasleft();
        spend.verify(proof, inputs);
        emit log_named_uint("spend verify gas", before - gasleft());
        (bytes memory sproof, bytes32[] memory sinputs) = _load("shield");
        before = gasleft();
        shield.verify(sproof, sinputs);
        emit log_named_uint("shield verify gas", before - gasleft());
    }

    function testFuzz_AnyChangedPublicInputIsRejected(uint8 index, uint256 delta) public {
        (bytes memory proof, bytes32[] memory inputs) = _load("spend");
        uint256 i = index % inputs.length;
        delta = bound(delta, 1, FIELD_MODULUS - 1);
        inputs[i] = bytes32(addmod(uint256(inputs[i]), delta, FIELD_MODULUS));
        vm.expectRevert();
        spend.verify(proof, inputs);
    }

    function test_TheSameValueOffsetByTheModulusIsRejected() public {
        (bytes memory proof, bytes32[] memory inputs) = _load("spend");
        inputs[5] = bytes32(uint256(inputs[5]) + FIELD_MODULUS);
        vm.expectRevert();
        spend.verify(proof, inputs);
    }

    function test_SwappedPublicInputsAreRejected() public {
        (bytes memory proof, bytes32[] memory inputs) = _load("spend");
        (inputs[1], inputs[2]) = (inputs[2], inputs[1]);
        vm.expectRevert();
        spend.verify(proof, inputs);
    }

    function test_ATruncatedOrExtendedInputListIsRejected() public {
        (bytes memory proof, bytes32[] memory inputs) = _load("spend");
        bytes32[] memory shorter = new bytes32[](inputs.length - 1);
        for (uint256 i = 0; i < shorter.length; i++) {
            shorter[i] = inputs[i];
        }
        vm.expectRevert();
        spend.verify(proof, shorter);
        bytes32[] memory longer = new bytes32[](inputs.length + 1);
        for (uint256 i = 0; i < inputs.length; i++) {
            longer[i] = inputs[i];
        }
        vm.expectRevert();
        spend.verify(proof, longer);
    }

    function testFuzz_AnyFlippedProofByteIsRejected(uint256 position, uint8 flip) public {
        (bytes memory proof, bytes32[] memory inputs) = _load("spend");
        flip = uint8(bound(flip, 1, 255));
        proof[position % proof.length] ^= bytes1(flip);
        try spend.verify(proof, inputs) returns (bool ok) {
            assertFalse(ok);
        } catch {}
    }

    function test_AProofIsOnlyValidForItsOwnCircuit() public {
        (bytes memory sp, bytes32[] memory spi) = _load("spend");
        (bytes memory sh, bytes32[] memory shi) = _load("shield");
        vm.expectRevert();
        shield.verify(sp, spi);
        vm.expectRevert();
        spend.verify(sh, shi);
    }

    function test_BothVerifiersFitUnderTheContractSizeLimit() public view {
        assertLt(address(shield).code.length, EIP170_LIMIT);
        assertLt(address(spend).code.length, EIP170_LIMIT);
    }
}
