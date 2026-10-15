// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

interface IInitializable {
    function initialize(address owner) external;
}

/// @notice Gives every owner exactly one vault at an address anyone can compute beforehand.
contract BoxVaultFactory {
    error AlreadyCreated();
    error CloneFailed();

    event VaultCreated(address indexed owner, address indexed vault);

    address public immutable implementation;
    mapping(address owner => address) public vaultOf;

    constructor(address implementation_) {
        implementation = implementation_;
    }

    function create(address owner) external returns (address vault) {
        if (vaultOf[owner] != address(0)) revert AlreadyCreated();
        bytes32 salt = bytes32(uint256(uint160(owner)));
        address impl = implementation;
        assembly ("memory-safe") {
            let ptr := mload(0x40)
            mstore(ptr, 0x3d602d80600a3d3981f3363d3d373d3d3d363d73000000000000000000000000)
            mstore(add(ptr, 0x14), shl(0x60, impl))
            mstore(add(ptr, 0x28), 0x5af43d82803e903d91602b57fd5bf30000000000000000000000000000000000)
            vault := create2(0, ptr, 0x37, salt)
        }
        if (vault == address(0)) revert CloneFailed();
        vaultOf[owner] = vault;
        IInitializable(vault).initialize(owner);
        emit VaultCreated(owner, vault);
    }

    function predict(address owner) external view returns (address) {
        bytes32 salt = bytes32(uint256(uint160(owner)));
        bytes memory code = abi.encodePacked(
            hex"3d602d80600a3d3981f3363d3d373d3d3d363d73", implementation, hex"5af43d82803e903d91602b57fd5bf3"
        );
        return
            address(uint160(uint256(keccak256(abi.encodePacked(bytes1(0xff), address(this), salt, keccak256(code))))));
    }
}
