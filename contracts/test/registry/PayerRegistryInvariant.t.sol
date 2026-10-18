// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Test} from "forge-std/Test.sol";
import {PayerRegistry} from "../../src/registry/PayerRegistry.sol";

contract PayerHandler is Test {
    PayerRegistry public registry;
    address public owner;
    address[5] public pool = [address(0xB1), address(0xB2), address(0xB3), address(0xB4), address(0xB5)];
    mapping(address => bool) public everRevoked;
    mapping(address => bool) public expectedKnown;

    constructor(PayerRegistry registry_, address owner_) {
        registry = registry_;
        owner = owner_;
    }

    function add(uint8 who, uint8 category, bytes32 metadata) external {
        address payer = pool[who % 5];
        if (expectedKnown[payer]) return;
        vm.prank(owner);
        registry.add(payer, PayerRegistry.Category(category % 4), metadata);
        expectedKnown[payer] = true;
    }

    function revoke(uint8 who) external {
        address payer = pool[who % 5];
        if (!expectedKnown[payer]) return;
        vm.prank(owner);
        registry.revoke(payer);
        expectedKnown[payer] = false;
        everRevoked[payer] = true;
    }
}

contract PayerRegistryInvariantTest is Test {
    PayerRegistry internal registry;
    PayerHandler internal handler;

    function setUp() public {
        address owner = makeAddr("owner");
        registry = new PayerRegistry(owner);
        handler = new PayerHandler(registry, owner);
        targetContract(address(handler));
    }

    function invariant_ARevokedEntryNeverReadsAsKnown() public view {
        for (uint256 i = 0; i < 5; ++i) {
            address payer = handler.pool(i);
            if (handler.everRevoked(payer) && !handler.expectedKnown(payer)) {
                assertFalse(registry.isKnownPayer(payer));
                (bool known,) = registry.categoryOf(payer);
                assertFalse(known);
            }
        }
    }

    function invariant_TheRegistryAgreesWithTheHandlerModel() public view {
        for (uint256 i = 0; i < 5; ++i) {
            address payer = handler.pool(i);
            (bool known,,,) = registry.entryOf(payer);
            assertEq(registry.isKnownPayer(payer), handler.expectedKnown(payer));
            assertEq(known, handler.expectedKnown(payer));
        }
    }
}
