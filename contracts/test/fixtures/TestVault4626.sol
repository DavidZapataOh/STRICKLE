// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {TestToken} from "./TestToken.sol";

/// @dev A small yield vault with the ERC-4626 entry points the box vault uses; `donate` and `slash` move its assets to model gains and losses.
contract TestVault4626 {
    TestToken public immutable token;
    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    bool public failRedeem;
    mapping(address owner => mapping(address spender => uint256)) public allowance;

    constructor(TestToken token_) {
        token = token_;
    }

    function asset() external view returns (address) {
        return address(token);
    }

    function totalAssets() public view returns (uint256) {
        return token.balanceOf(address(this));
    }

    function deposit(uint256 assets, address receiver) external returns (uint256 shares) {
        shares = previewDeposit(assets);
        token.transferFrom(msg.sender, address(this), assets);
        balanceOf[receiver] += shares;
        totalSupply += shares;
    }

    function redeem(uint256 shares, address receiver, address from) external returns (uint256 assets) {
        require(!failRedeem, "redeem disabled");
        require(msg.sender == from, "owner only");
        assets = previewRedeem(shares);
        balanceOf[from] -= shares;
        totalSupply -= shares;
        token.transfer(receiver, assets);
    }

    function previewDeposit(uint256 assets) public view returns (uint256) {
        return totalSupply == 0 || totalAssets() == 0 ? assets : (assets * totalSupply) / totalAssets();
    }

    function previewRedeem(uint256 shares) public view returns (uint256) {
        return totalSupply == 0 ? shares : (shares * totalAssets()) / totalSupply;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    function convertToAssets(uint256 shares) external view returns (uint256) {
        return totalSupply == 0 ? shares : (shares * totalAssets()) / totalSupply;
    }

    function donate(uint256 amount) external {
        token.mint(address(this), amount);
    }

    function slash(uint256 amount) external {
        token.transfer(address(0xdead), amount);
    }

    function setFailRedeem(bool value) external {
        failRedeem = value;
    }
}
