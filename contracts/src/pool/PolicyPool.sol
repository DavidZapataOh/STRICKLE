// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {IHonkVerifier} from "./IHonkVerifier.sol";
import {NullifierSet} from "./NullifierSet.sol";
import {PoolTree} from "./PoolTree.sol";

interface IERC20Like {
    function balanceOf(address account) external view returns (uint256);
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

/// @notice Shielded pool: shield USDC/EURC into policy-carrying notes, spend them privately under the
/// circuit's rules and unshield to a public address. The circuits enforce every box rule; this contract
/// enforces what only the chain can know: roots, time, nullifiers, caps, and token movements.
contract PolicyPool is PoolTree, NullifierSet {
    uint256 public constant MAX_PROOF_AGE = 600;
    uint256 public constant MAX_CIPHERTEXT = 2048;
    uint256 private constant SPEND_INPUTS = 11;
    uint256 private constant SHIELD_INPUTS = 4;

    struct Caps {
        uint128 perUser;
        uint128 global;
    }

    struct Config {
        address usdc;
        address eurc;
        IHonkVerifier shieldVerifier;
        IHonkVerifier spendVerifier;
        address owner;
        address guardian;
        uint128[2] perUserCaps;
        uint128[2] globalCaps;
    }

    struct SpendInputs {
        uint256 root;
        uint256[2] nullifiers;
        uint256[2] commitments;
        uint64 publicAmount;
        uint256 recipient;
        uint8 asset;
        uint64 timestamp;
        uint256 associationRoot;
    }

    error InvalidProof();
    error UnknownRoot();
    error StaleTimestamp();
    error UnknownAssociationRoot();
    error UnknownAsset();
    error ZeroAmount();
    error AmountTooLarge();
    error UserCapExceeded();
    error GlobalCapExceeded();
    error CiphertextTooLarge();
    error InvalidRecipient();
    error PoolPaused();
    error NotOwner();
    error NotGuardian();
    error CapsCanOnlyDecrease();
    error TransferFailed();
    error Reentrancy();

    event NotesInserted(uint32 indexed index, uint256 commitment0, uint256 commitment1, bytes ciphertext);
    event Shielded(address indexed depositor, uint8 indexed asset, uint256 amount, uint256 label);
    event Spent(
        uint256 nullifier0, uint256 nullifier1, uint8 indexed asset, uint64 publicAmount, address indexed recipient
    );
    event CapsLowered(uint8 indexed asset, uint128 perUser, uint128 global);
    event Paused(address by);
    event Unpaused(address by);
    event GuardianChanged(address guardian);
    event OwnershipTransferStarted(address pendingOwner);
    event OwnershipTransferred(address owner);
    event AssociationRootSet(uint256 root, bool approved);

    IERC20Like private immutable USDC;
    IERC20Like private immutable EURC;
    IHonkVerifier public immutable shieldVerifier;
    IHonkVerifier public immutable spendVerifier;

    address public owner;
    address public pendingOwner;
    address public guardian;
    bool public paused;
    uint256 private lock = 1;

    mapping(uint8 asset => Caps) public caps;
    mapping(uint8 asset => uint256) public totalShielded;
    mapping(uint8 asset => mapping(address user => uint256)) public shieldedBy;
    mapping(address user => uint256) public shieldNonce;
    mapping(uint256 root => bool) public approvedAssociationRoot;

    modifier nonReentrant() {
        if (lock != 1) revert Reentrancy();
        lock = 2;
        _;
        lock = 1;
    }

    modifier whenNotPaused() {
        if (paused) revert PoolPaused();
        _;
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    constructor(Config memory config) {
        USDC = IERC20Like(config.usdc);
        EURC = IERC20Like(config.eurc);
        shieldVerifier = config.shieldVerifier;
        spendVerifier = config.spendVerifier;
        owner = config.owner;
        guardian = config.guardian;
        caps[1] = Caps(config.perUserCaps[0], config.globalCaps[0]);
        caps[2] = Caps(config.perUserCaps[1], config.globalCaps[1]);
    }

    function shield(uint8 asset, uint256 amount, uint256 commitment, bytes calldata proof, bytes calldata ciphertext)
        external
        nonReentrant
        whenNotPaused
        returns (uint32 index)
    {
        if (amount == 0) revert ZeroAmount();
        if (amount > type(uint64).max) revert AmountTooLarge();
        if (ciphertext.length > MAX_CIPHERTEXT) revert CiphertextTooLarge();
        uint256 label = _admitDeposit(asset, amount, commitment, proof);
        (index,) = _insertPair(commitment, 0);
        _pull(_token(asset), amount);
        emit Shielded(msg.sender, asset, amount, label);
        emit NotesInserted(index, commitment, 0, ciphertext);
    }

    function spend(bytes calldata proof, SpendInputs calldata p, bytes calldata ciphertext)
        external
        nonReentrant
        whenNotPaused
        returns (uint32 index)
    {
        IERC20Like token = _token(p.asset);
        if (ciphertext.length > MAX_CIPHERTEXT) revert CiphertextTooLarge();
        if (p.timestamp > block.timestamp || p.timestamp + MAX_PROOF_AGE < block.timestamp) revert StaleTimestamp();
        if (!isKnownRoot(p.root)) revert UnknownRoot();
        if (p.associationRoot != 0 && !approvedAssociationRoot[p.associationRoot]) revert UnknownAssociationRoot();
        address recipient = _recipient(p);
        _checkField(p.nullifiers[0]);
        _checkField(p.nullifiers[1]);

        _verify(spendVerifier, proof, _spendInputs(p, ciphertext));

        _spendPair(p.nullifiers[0], p.nullifiers[1]);
        (index,) = _insertPair(p.commitments[0], p.commitments[1]);
        emit NotesInserted(index, p.commitments[0], p.commitments[1], ciphertext);
        emit Spent(p.nullifiers[0], p.nullifiers[1], p.asset, p.publicAmount, recipient);

        if (p.publicAmount != 0) {
            totalShielded[p.asset] -= p.publicAmount;
            _call(token, abi.encodeCall(IERC20Like.transfer, (recipient, p.publicAmount)));
        }
    }

    function lowerCaps(uint8 asset, uint128 perUser, uint128 global) external onlyOwner {
        _token(asset);
        Caps memory current = caps[asset];
        if (perUser > current.perUser || global > current.global) revert CapsCanOnlyDecrease();
        caps[asset] = Caps(perUser, global);
        emit CapsLowered(asset, perUser, global);
    }

    function pause() external {
        if (msg.sender != guardian && msg.sender != owner) revert NotGuardian();
        paused = true;
        emit Paused(msg.sender);
    }

    function unpause() external onlyOwner {
        paused = false;
        emit Unpaused(msg.sender);
    }

    function setGuardian(address guardian_) external onlyOwner {
        guardian = guardian_;
        emit GuardianChanged(guardian_);
    }

    function setAssociationRoot(uint256 root, bool approved) external onlyOwner {
        approvedAssociationRoot[root] = approved;
        emit AssociationRootSet(root, approved);
    }

    function transferOwnership(address next) external onlyOwner {
        pendingOwner = next;
        emit OwnershipTransferStarted(next);
    }

    function acceptOwnership() external {
        if (msg.sender != pendingOwner) revert NotOwner();
        owner = msg.sender;
        pendingOwner = address(0);
        emit OwnershipTransferred(msg.sender);
    }

    function _admitDeposit(uint8 asset, uint256 amount, uint256 commitment, bytes calldata proof)
        private
        returns (uint256 label)
    {
        _token(asset);
        _recordDeposit(asset, amount);
        label = _nextLabel();
        _verify(shieldVerifier, proof, _shieldInputs(commitment, amount, asset, label));
    }

    function _pull(IERC20Like token, uint256 amount) private {
        uint256 before = token.balanceOf(address(this));
        _call(token, abi.encodeCall(IERC20Like.transferFrom, (msg.sender, address(this), amount)));
        if (token.balanceOf(address(this)) - before != amount) revert TransferFailed();
    }

    function _recordDeposit(uint8 asset, uint256 amount) private {
        Caps memory limit = caps[asset];
        uint256 user = shieldedBy[asset][msg.sender] + amount;
        if (user > limit.perUser) revert UserCapExceeded();
        uint256 total = totalShielded[asset] + amount;
        if (total > limit.global) revert GlobalCapExceeded();
        shieldedBy[asset][msg.sender] = user;
        totalShielded[asset] = total;
    }

    function _nextLabel() private returns (uint256) {
        uint256 nonce = shieldNonce[msg.sender]++;
        return (uint256(keccak256(abi.encode(msg.sender, nonce))) % (FIELD_MODULUS() - 1)) + 1;
    }

    function _recipient(SpendInputs calldata p) private view returns (address) {
        if (p.publicAmount == 0) return address(0);
        if (p.recipient == 0 || p.recipient >> 160 != 0 || address(uint160(p.recipient)) == address(this)) {
            revert InvalidRecipient();
        }
        return address(uint160(p.recipient));
    }

    function _shieldInputs(uint256 commitment, uint256 amount, uint8 asset, uint256 label)
        private
        pure
        returns (bytes32[] memory inputs)
    {
        inputs = new bytes32[](SHIELD_INPUTS);
        inputs[0] = bytes32(commitment);
        inputs[1] = bytes32(amount);
        inputs[2] = bytes32(uint256(asset));
        inputs[3] = bytes32(label);
    }

    function _spendInputs(SpendInputs calldata p, bytes calldata ciphertext)
        private
        pure
        returns (bytes32[] memory inputs)
    {
        inputs = new bytes32[](SPEND_INPUTS);
        inputs[0] = bytes32(p.root);
        inputs[1] = bytes32(p.nullifiers[0]);
        inputs[2] = bytes32(p.nullifiers[1]);
        inputs[3] = bytes32(p.commitments[0]);
        inputs[4] = bytes32(p.commitments[1]);
        inputs[5] = bytes32(uint256(p.publicAmount));
        inputs[6] = bytes32(p.recipient);
        inputs[7] = bytes32(uint256(p.asset));
        inputs[8] = bytes32(uint256(p.timestamp));
        inputs[9] = bytes32(
            uint256(keccak256(ciphertext))
                % 21888242871839275222246405745257275088548364400416034343698204186575808495617
        );
        inputs[10] = bytes32(p.associationRoot);
    }

    function _token(uint8 asset) private view returns (IERC20Like) {
        if (asset == 1) return USDC;
        if (asset == 2) return EURC;
        revert UnknownAsset();
    }

    function _checkField(uint256 value) private pure {
        if (value >= 21888242871839275222246405745257275088548364400416034343698204186575808495617) {
            revert NotFieldElement(value);
        }
    }

    function _verify(IHonkVerifier verifier, bytes calldata proof, bytes32[] memory inputs) private view {
        try verifier.verify(proof, inputs) returns (bool ok) {
            if (!ok) revert InvalidProof();
        } catch {
            revert InvalidProof();
        }
    }

    function _call(IERC20Like token, bytes memory data) private {
        (bool ok, bytes memory result) = address(token).call(data);
        if (!ok || (result.length != 0 && !abi.decode(result, (bool)))) revert TransferFailed();
    }
}
