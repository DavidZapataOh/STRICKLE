// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {TestToken} from "./TestToken.sol";

/// @dev A token that calls back into a chosen target (with chosen calldata) in the middle of a transfer,
/// as a malicious token or a token with hooks would.
contract HostileToken is TestToken {
    address public target;
    bytes public payload;
    bool public reentered;
    uint256 public attempts;

    function arm(address target_, bytes calldata payload_) external {
        target = target_;
        payload = payload_;
    }

    function _hook() private {
        if (target == address(0)) return;
        attempts++;
        (bool ok,) = target.call(payload);
        if (ok) reentered = true;
    }

    function transfer(address to, uint256 amount) external override returns (bool) {
        _hook();
        return _move(msg.sender, to, amount);
    }

    function transferFrom(address from, address to, uint256 amount) external override returns (bool) {
        _hook();
        allowance[from][msg.sender] -= amount;
        return _move(from, to, amount);
    }
}
