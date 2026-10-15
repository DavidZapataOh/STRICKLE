// contracts/src/cre/AgentExecutor.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {CreReceiver} from "./CreReceiver.sol";

interface IVault {
    function owner() external view returns (address);
    function agent() external view returns (address);
    function agentPaused() external view returns (bool);
    function unallocated(uint8 asset) external view returns (uint256);
    function split(uint8 asset, uint8[] calldata boxes, uint256[] calldata amounts) external;
}

interface IFactory {
    function vaultOf(address owner) external view returns (address);
}

interface IStateStore {
    function store(address vault, uint64 next, bytes calldata ciphertext) external;
}

/// @notice The only contract users delegate the agent role to. It can allocate what arrived in a vault and
/// nothing else: no action here moves funds out.
contract AgentExecutor is CreReceiver {
    uint8 public constant SPLIT = 1;
    uint256 public constant MAX_SCAN = 300;

    error NotAVault();
    error AlreadyRegistered();
    error NotDelegated();
    error Stale(uint256 seen, uint256 live);
    error NotFullySplit();
    error UnknownAction(uint8 action);

    event Registered(address indexed vault);
    event Split(address indexed vault, uint8 indexed asset, uint256 amount);

    struct Pending {
        address vault;
        uint8 asset;
        uint256 amount;
    }

    IFactory public immutable factory;
    IStateStore public immutable state;
    address[] public vaults;
    mapping(address vault => bool) public registered;

    constructor(address forwarder_, address owner_, address factory_, address state_) CreReceiver(forwarder_, owner_) {
        factory = IFactory(factory_);
        state = IStateStore(state_);
    }

    function count() external view returns (uint256) {
        return vaults.length;
    }

    /// @notice Only a vault's owner registers it, so nobody can fill the registry with vaults that are not theirs.
    function register(address vault) external {
        if (registered[vault]) revert AlreadyRegistered();
        address vaultOwner = IVault(vault).owner();
        if (msg.sender != vaultOwner) revert NotOwner();
        if (factory.vaultOf(vaultOwner) != vault) revert NotAVault();
        registered[vault] = true;
        vaults.push(vault);
        emit Registered(vault);
    }

    /// @notice Up to `maxHits` unallocated balances of delegated vaults, scanning the registry in a circle from
    /// `seed % count` so that a caller that moves the seed serves every vault in turn. One eth_call, bounded by MAX_SCAN.
    function pending(uint256 seed, uint256 maxHits) external view returns (Pending[] memory out) {
        uint256 total = vaults.length;
        if (total == 0 || maxHits == 0) return new Pending[](0);
        uint256 scan = total < MAX_SCAN ? total : MAX_SCAN;
        out = new Pending[](maxHits);
        uint256 n;
        uint256 start = seed % total;
        for (uint256 i; i < scan && n < maxHits; ++i) {
            IVault vault = IVault(vaults[(start + i) % total]);
            if (vault.agent() != address(this) || vault.agentPaused()) continue;
            for (uint8 asset = 1; asset <= 2 && n < maxHits; ++asset) {
                uint256 amount = vault.unallocated(asset);
                if (amount != 0) out[n++] = Pending(address(vault), asset, amount);
            }
        }
        assembly ("memory-safe") {
            mstore(out, n)
        }
    }

    function _processReport(bytes32, bytes calldata report) internal override {
        (uint8 action, bytes memory args) = abi.decode(report, (uint8, bytes));
        if (action != SPLIT) revert UnknownAction(action);
        _split(args);
    }

    function _split(bytes memory args) private {
        (
            address vault,
            uint8 asset,
            uint256 seen,
            uint8[] memory boxes,
            uint256[] memory amounts,
            uint64 next,
            bytes memory ciphertext
        ) = abi.decode(args, (address, uint8, uint256, uint8[], uint256[], uint64, bytes));
        if (!registered[vault]) revert NotAVault();
        if (IVault(vault).agent() != address(this)) revert NotDelegated();
        uint256 live = IVault(vault).unallocated(asset);
        if (live != seen) revert Stale(seen, live);
        uint256 total;
        for (uint256 i = 0; i < amounts.length; ++i) {
            total += amounts[i];
        }
        if (total != seen) revert NotFullySplit();
        IVault(vault).split(asset, boxes, amounts);
        state.store(vault, next, ciphertext);
        emit Split(vault, asset, seen);
    }
}
