// contracts/src/cre/IReceiver.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

interface IERC165 {
    function supportsInterface(bytes4 interfaceId) external view returns (bool);
}

/// @notice Receives reports delivered by the CRE KeystoneForwarder.
interface IReceiver is IERC165 {
    function onReport(bytes calldata metadata, bytes calldata report) external;
}
