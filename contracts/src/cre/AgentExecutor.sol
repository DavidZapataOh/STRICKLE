// contracts/src/cre/AgentExecutor.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {CreReceiver} from "./CreReceiver.sol";
import {PolicyPool} from "../pool/PolicyPool.sol";

interface IVault {
    function owner() external view returns (address);
    function agent() external view returns (address);
    function agentPaused() external view returns (bool);
    function unallocated(uint8 asset) external view returns (uint256);
    function split(uint8 asset, uint8[] calldata boxes, uint256[] calldata amounts) external;
    function boxBalance(uint8 asset, uint8 box) external view returns (uint256);
    function payAllowlisted(uint8 asset, uint8 box, address to, uint256 amount) external;
    function swapBox(uint8 box, uint8 assetIn, uint256 amountIn, uint256 minOut, bytes calldata data) external;
    function sharesOf(address earnVault, uint8 box) external view returns (uint256);
    function earnIn(uint8 asset, uint8 box, address earnVault, uint256 amount, uint256 minOut, bytes calldata data)
        external;
    function earnOut(uint8 asset, uint8 box, address earnVault, uint256 shares, uint256 minOut, bytes calldata data)
        external;
}

interface IFactory {
    function vaultOf(address owner) external view returns (address);
}

interface IStateStore {
    function store(address vault, uint64 next, bytes calldata ciphertext) external;
    function notify(address vault, uint64 id, bytes calldata sealedData) external;
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

    PolicyPool public immutable pool;

    event PrivateSpend(address indexed vault, uint256 nullifier0);

    constructor(address forwarder_, address owner_, address factory_, address state_, address pool_)
        CreReceiver(forwarder_, owner_)
    {
        factory = IFactory(factory_);
        state = IStateStore(state_);
        pool = PolicyPool(pool_);
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

    uint8 public constant PAY_SALARY = 2;
    uint8 public constant TICK = 3;
    uint8 public constant NOTICE = 4;
    uint8 public constant PRIVATE_SPEND = 5;
    uint8 public constant SWAP = 6;
    uint8 public constant EARN_IN = 7;
    uint8 public constant EARN_OUT = 8;
    uint8 public constant SALARY_BOX = 3;

    event SalaryPaid(address indexed vault, uint8 indexed asset, address indexed payee, uint256 amount);
    event Swapped(address indexed vault, uint8 indexed box, uint8 indexed assetIn, uint256 amountIn);
    event EarnForwarded(address indexed vault, uint8 indexed box, bool deposit, uint256 amount);

    /// @dev `amount` is USDC (or EURC) for a deposit and yield-vault shares for a withdrawal; `seen` is the live value the enclave read for the same thing.
    struct EarnReport {
        address vault;
        uint8 asset;
        uint8 box;
        address earnVault;
        uint256 amount;
        uint256 minOut;
        uint256 seen;
        bytes data;
        uint64 next;
        bytes ciphertext;
    }

    /// @notice Up to `maxHits` active delegations, scanning the registry in a circle from `seed % count` (see `pending`).
    function delegated(uint256 seed, uint256 maxHits) external view returns (address[] memory out) {
        uint256 total = vaults.length;
        if (total == 0 || maxHits == 0) return new address[](0);
        uint256 scan = total < MAX_SCAN ? total : MAX_SCAN;
        out = new address[](maxHits);
        uint256 n;
        uint256 start = seed % total;
        for (uint256 i; i < scan && n < maxHits; ++i) {
            IVault vault = IVault(vaults[(start + i) % total]);
            if (vault.agent() == address(this) && !vault.agentPaused()) out[n++] = address(vault);
        }
        assembly ("memory-safe") {
            mstore(out, n)
        }
    }

    function _processReport(bytes32, bytes calldata report) internal override {
        (uint8 action, bytes memory args) = abi.decode(report, (uint8, bytes));
        if (action == SPLIT) _split(args);
        else if (action == PAY_SALARY) _paySalary(args);
        else if (action == TICK) _tick(args);
        else if (action == NOTICE) _notice(args);
        else if (action == PRIVATE_SPEND) _privateSpend(args);
        else if (action == SWAP) _swap(args);
        else if (action == EARN_IN || action == EARN_OUT) _earn(args, action == EARN_IN);
        else revert UnknownAction(action);
    }

    function _requireActive(address vault) private view {
        if (!registered[vault]) revert NotAVault();
        if (IVault(vault).agent() != address(this) || IVault(vault).agentPaused()) revert NotDelegated();
    }

    function _paySalary(bytes memory args) private {
        (
            address vault,
            uint8 asset,
            address payee,
            uint256 amount,
            uint256 seen,
            uint64 next,
            bytes memory ciphertext
        ) = abi.decode(args, (address, uint8, address, uint256, uint256, uint64, bytes));
        _requireActive(vault);
        uint256 live = IVault(vault).boxBalance(asset, SALARY_BOX);
        if (live != seen) revert Stale(seen, live);
        IVault(vault).payAllowlisted(asset, SALARY_BOX, payee, amount);
        state.store(vault, next, ciphertext);
        emit SalaryPaid(vault, asset, payee, amount);
    }

    function _notice(bytes memory args) private {
        (address vault, uint64 id, bytes memory sealedData) = abi.decode(args, (address, uint64, bytes));
        if (!registered[vault]) revert NotAVault();
        state.notify(vault, id, sealedData);
    }

    function _privateSpend(bytes memory args) private {
        (
            address vault,
            bytes memory proof,
            PolicyPool.SpendInputs memory p,
            bytes memory poolCiphertext,
            uint64 next,
            bytes memory stateCiphertext
        ) = abi.decode(args, (address, bytes, PolicyPool.SpendInputs, bytes, uint64, bytes));
        if (!registered[vault]) revert NotAVault();
        pool.spend(proof, p, poolCiphertext);
        state.store(vault, next, stateCiphertext);
        emit PrivateSpend(vault, p.nullifiers[0]);
    }

    function _swap(bytes memory args) private {
        (
            address vault,
            uint8 box,
            uint8 assetIn,
            uint256 amountIn,
            uint256 minOut,
            uint256 seen,
            bytes memory data,
            uint64 next,
            bytes memory ciphertext
        ) = abi.decode(args, (address, uint8, uint8, uint256, uint256, uint256, bytes, uint64, bytes));
        _requireActive(vault);
        uint256 live = IVault(vault).boxBalance(assetIn, box);
        if (live != seen) revert Stale(seen, live);
        IVault(vault).swapBox(box, assetIn, amountIn, minOut, data);
        state.store(vault, next, ciphertext);
        emit Swapped(vault, box, assetIn, amountIn);
    }

    function _earn(bytes memory args, bool deposit) private {
        EarnReport memory report = abi.decode(args, (EarnReport));
        _requireActive(report.vault);
        IVault vault = IVault(report.vault);
        uint256 live =
            deposit ? vault.boxBalance(report.asset, report.box) : vault.sharesOf(report.earnVault, report.box);
        if (live != report.seen) revert Stale(report.seen, live);
        if (deposit) {
            vault.earnIn(report.asset, report.box, report.earnVault, report.amount, report.minOut, report.data);
        } else {
            vault.earnOut(report.asset, report.box, report.earnVault, report.amount, report.minOut, report.data);
        }
        state.store(report.vault, report.next, report.ciphertext);
        emit EarnForwarded(report.vault, report.box, deposit, report.amount);
    }

    function _tick(bytes memory args) private {
        (address vault, uint64 next, bytes memory ciphertext) = abi.decode(args, (address, uint64, bytes));
        _requireActive(vault);
        state.store(vault, next, ciphertext);
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
        _requireActive(vault);
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
