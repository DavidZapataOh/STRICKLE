export declare const poolAbi: readonly [{
    readonly type: "constructor";
    readonly inputs: readonly [{
        readonly name: "config";
        readonly type: "tuple";
        readonly internalType: "struct PolicyPool.Config";
        readonly components: readonly [{
            readonly name: "hasher";
            readonly type: "address";
            readonly internalType: "contract IPoseidon2";
        }, {
            readonly name: "usdc";
            readonly type: "address";
            readonly internalType: "address";
        }, {
            readonly name: "eurc";
            readonly type: "address";
            readonly internalType: "address";
        }, {
            readonly name: "shieldVerifier";
            readonly type: "address";
            readonly internalType: "contract IHonkVerifier";
        }, {
            readonly name: "spendVerifier";
            readonly type: "address";
            readonly internalType: "contract IHonkVerifier";
        }, {
            readonly name: "screening";
            readonly type: "address";
            readonly internalType: "contract IScreening";
        }, {
            readonly name: "association";
            readonly type: "address";
            readonly internalType: "contract IAssociation";
        }, {
            readonly name: "elevatedCapBps";
            readonly type: "uint16";
            readonly internalType: "uint16";
        }, {
            readonly name: "owner";
            readonly type: "address";
            readonly internalType: "address";
        }, {
            readonly name: "guardian";
            readonly type: "address";
            readonly internalType: "address";
        }, {
            readonly name: "perUserCaps";
            readonly type: "uint128[2]";
            readonly internalType: "uint128[2]";
        }, {
            readonly name: "globalCaps";
            readonly type: "uint128[2]";
            readonly internalType: "uint128[2]";
        }];
    }];
    readonly stateMutability: "nonpayable";
}, {
    readonly type: "function";
    readonly name: "DEPTH";
    readonly inputs: readonly [];
    readonly outputs: readonly [{
        readonly name: "";
        readonly type: "uint256";
        readonly internalType: "uint256";
    }];
    readonly stateMutability: "view";
}, {
    readonly type: "function";
    readonly name: "FIELD_MODULUS";
    readonly inputs: readonly [];
    readonly outputs: readonly [{
        readonly name: "";
        readonly type: "uint256";
        readonly internalType: "uint256";
    }];
    readonly stateMutability: "pure";
}, {
    readonly type: "function";
    readonly name: "GUARDIAN_PAUSE";
    readonly inputs: readonly [];
    readonly outputs: readonly [{
        readonly name: "";
        readonly type: "uint64";
        readonly internalType: "uint64";
    }];
    readonly stateMutability: "view";
}, {
    readonly type: "function";
    readonly name: "MAX_CIPHERTEXT";
    readonly inputs: readonly [];
    readonly outputs: readonly [{
        readonly name: "";
        readonly type: "uint256";
        readonly internalType: "uint256";
    }];
    readonly stateMutability: "view";
}, {
    readonly type: "function";
    readonly name: "MAX_PROOF_AGE";
    readonly inputs: readonly [];
    readonly outputs: readonly [{
        readonly name: "";
        readonly type: "uint256";
        readonly internalType: "uint256";
    }];
    readonly stateMutability: "view";
}, {
    readonly type: "function";
    readonly name: "ROOT_HISTORY";
    readonly inputs: readonly [];
    readonly outputs: readonly [{
        readonly name: "";
        readonly type: "uint256";
        readonly internalType: "uint256";
    }];
    readonly stateMutability: "view";
}, {
    readonly type: "function";
    readonly name: "acceptOwnership";
    readonly inputs: readonly [];
    readonly outputs: readonly [];
    readonly stateMutability: "nonpayable";
}, {
    readonly type: "function";
    readonly name: "association";
    readonly inputs: readonly [];
    readonly outputs: readonly [{
        readonly name: "";
        readonly type: "address";
        readonly internalType: "contract IAssociation";
    }];
    readonly stateMutability: "view";
}, {
    readonly type: "function";
    readonly name: "caps";
    readonly inputs: readonly [{
        readonly name: "asset";
        readonly type: "uint8";
        readonly internalType: "uint8";
    }];
    readonly outputs: readonly [{
        readonly name: "perUser";
        readonly type: "uint128";
        readonly internalType: "uint128";
    }, {
        readonly name: "global";
        readonly type: "uint128";
        readonly internalType: "uint128";
    }];
    readonly stateMutability: "view";
}, {
    readonly type: "function";
    readonly name: "currentRoot";
    readonly inputs: readonly [];
    readonly outputs: readonly [{
        readonly name: "";
        readonly type: "uint256";
        readonly internalType: "uint256";
    }];
    readonly stateMutability: "view";
}, {
    readonly type: "function";
    readonly name: "elevatedCapBps";
    readonly inputs: readonly [];
    readonly outputs: readonly [{
        readonly name: "";
        readonly type: "uint16";
        readonly internalType: "uint16";
    }];
    readonly stateMutability: "view";
}, {
    readonly type: "function";
    readonly name: "guardian";
    readonly inputs: readonly [];
    readonly outputs: readonly [{
        readonly name: "";
        readonly type: "address";
        readonly internalType: "address";
    }];
    readonly stateMutability: "view";
}, {
    readonly type: "function";
    readonly name: "hasher";
    readonly inputs: readonly [];
    readonly outputs: readonly [{
        readonly name: "";
        readonly type: "address";
        readonly internalType: "contract IPoseidon2";
    }];
    readonly stateMutability: "view";
}, {
    readonly type: "function";
    readonly name: "isKnownRoot";
    readonly inputs: readonly [{
        readonly name: "root";
        readonly type: "uint256";
        readonly internalType: "uint256";
    }];
    readonly outputs: readonly [{
        readonly name: "";
        readonly type: "bool";
        readonly internalType: "bool";
    }];
    readonly stateMutability: "view";
}, {
    readonly type: "function";
    readonly name: "isSpent";
    readonly inputs: readonly [{
        readonly name: "nullifier";
        readonly type: "uint256";
        readonly internalType: "uint256";
    }];
    readonly outputs: readonly [{
        readonly name: "";
        readonly type: "bool";
        readonly internalType: "bool";
    }];
    readonly stateMutability: "view";
}, {
    readonly type: "function";
    readonly name: "lowerCaps";
    readonly inputs: readonly [{
        readonly name: "asset";
        readonly type: "uint8";
        readonly internalType: "uint8";
    }, {
        readonly name: "perUser";
        readonly type: "uint128";
        readonly internalType: "uint128";
    }, {
        readonly name: "global";
        readonly type: "uint128";
        readonly internalType: "uint128";
    }];
    readonly outputs: readonly [];
    readonly stateMutability: "nonpayable";
}, {
    readonly type: "function";
    readonly name: "owner";
    readonly inputs: readonly [];
    readonly outputs: readonly [{
        readonly name: "";
        readonly type: "address";
        readonly internalType: "address";
    }];
    readonly stateMutability: "view";
}, {
    readonly type: "function";
    readonly name: "pause";
    readonly inputs: readonly [];
    readonly outputs: readonly [];
    readonly stateMutability: "nonpayable";
}, {
    readonly type: "function";
    readonly name: "paused";
    readonly inputs: readonly [];
    readonly outputs: readonly [{
        readonly name: "";
        readonly type: "bool";
        readonly internalType: "bool";
    }];
    readonly stateMutability: "view";
}, {
    readonly type: "function";
    readonly name: "pausedUntil";
    readonly inputs: readonly [];
    readonly outputs: readonly [{
        readonly name: "";
        readonly type: "uint64";
        readonly internalType: "uint64";
    }];
    readonly stateMutability: "view";
}, {
    readonly type: "function";
    readonly name: "pendingOwner";
    readonly inputs: readonly [];
    readonly outputs: readonly [{
        readonly name: "";
        readonly type: "address";
        readonly internalType: "address";
    }];
    readonly stateMutability: "view";
}, {
    readonly type: "function";
    readonly name: "screening";
    readonly inputs: readonly [];
    readonly outputs: readonly [{
        readonly name: "";
        readonly type: "address";
        readonly internalType: "contract IScreening";
    }];
    readonly stateMutability: "view";
}, {
    readonly type: "function";
    readonly name: "setGuardian";
    readonly inputs: readonly [{
        readonly name: "guardian_";
        readonly type: "address";
        readonly internalType: "address";
    }];
    readonly outputs: readonly [];
    readonly stateMutability: "nonpayable";
}, {
    readonly type: "function";
    readonly name: "shield";
    readonly inputs: readonly [{
        readonly name: "asset";
        readonly type: "uint8";
        readonly internalType: "uint8";
    }, {
        readonly name: "amount";
        readonly type: "uint256";
        readonly internalType: "uint256";
    }, {
        readonly name: "commitment";
        readonly type: "uint256";
        readonly internalType: "uint256";
    }, {
        readonly name: "proof";
        readonly type: "bytes";
        readonly internalType: "bytes";
    }, {
        readonly name: "ciphertext";
        readonly type: "bytes";
        readonly internalType: "bytes";
    }];
    readonly outputs: readonly [{
        readonly name: "index";
        readonly type: "uint32";
        readonly internalType: "uint32";
    }];
    readonly stateMutability: "nonpayable";
}, {
    readonly type: "function";
    readonly name: "shieldNonce";
    readonly inputs: readonly [{
        readonly name: "user";
        readonly type: "address";
        readonly internalType: "address";
    }];
    readonly outputs: readonly [{
        readonly name: "";
        readonly type: "uint256";
        readonly internalType: "uint256";
    }];
    readonly stateMutability: "view";
}, {
    readonly type: "function";
    readonly name: "shieldVerifier";
    readonly inputs: readonly [];
    readonly outputs: readonly [{
        readonly name: "";
        readonly type: "address";
        readonly internalType: "contract IHonkVerifier";
    }];
    readonly stateMutability: "view";
}, {
    readonly type: "function";
    readonly name: "shieldedBy";
    readonly inputs: readonly [{
        readonly name: "asset";
        readonly type: "uint8";
        readonly internalType: "uint8";
    }, {
        readonly name: "user";
        readonly type: "address";
        readonly internalType: "address";
    }];
    readonly outputs: readonly [{
        readonly name: "";
        readonly type: "uint256";
        readonly internalType: "uint256";
    }];
    readonly stateMutability: "view";
}, {
    readonly type: "function";
    readonly name: "spend";
    readonly inputs: readonly [{
        readonly name: "proof";
        readonly type: "bytes";
        readonly internalType: "bytes";
    }, {
        readonly name: "p";
        readonly type: "tuple";
        readonly internalType: "struct PolicyPool.SpendInputs";
        readonly components: readonly [{
            readonly name: "root";
            readonly type: "uint256";
            readonly internalType: "uint256";
        }, {
            readonly name: "nullifiers";
            readonly type: "uint256[2]";
            readonly internalType: "uint256[2]";
        }, {
            readonly name: "commitments";
            readonly type: "uint256[2]";
            readonly internalType: "uint256[2]";
        }, {
            readonly name: "publicAmount";
            readonly type: "uint64";
            readonly internalType: "uint64";
        }, {
            readonly name: "recipient";
            readonly type: "uint256";
            readonly internalType: "uint256";
        }, {
            readonly name: "asset";
            readonly type: "uint8";
            readonly internalType: "uint8";
        }, {
            readonly name: "timestamp";
            readonly type: "uint64";
            readonly internalType: "uint64";
        }, {
            readonly name: "associationRoot";
            readonly type: "uint256";
            readonly internalType: "uint256";
        }, {
            readonly name: "enc";
            readonly type: "uint256[2]";
            readonly internalType: "uint256[2]";
        }];
    }, {
        readonly name: "ciphertext";
        readonly type: "bytes";
        readonly internalType: "bytes";
    }];
    readonly outputs: readonly [{
        readonly name: "index";
        readonly type: "uint32";
        readonly internalType: "uint32";
    }];
    readonly stateMutability: "nonpayable";
}, {
    readonly type: "function";
    readonly name: "spendVerifier";
    readonly inputs: readonly [];
    readonly outputs: readonly [{
        readonly name: "";
        readonly type: "address";
        readonly internalType: "contract IHonkVerifier";
    }];
    readonly stateMutability: "view";
}, {
    readonly type: "function";
    readonly name: "totalShielded";
    readonly inputs: readonly [{
        readonly name: "asset";
        readonly type: "uint8";
        readonly internalType: "uint8";
    }];
    readonly outputs: readonly [{
        readonly name: "";
        readonly type: "uint256";
        readonly internalType: "uint256";
    }];
    readonly stateMutability: "view";
}, {
    readonly type: "function";
    readonly name: "transferOwnership";
    readonly inputs: readonly [{
        readonly name: "next";
        readonly type: "address";
        readonly internalType: "address";
    }];
    readonly outputs: readonly [];
    readonly stateMutability: "nonpayable";
}, {
    readonly type: "function";
    readonly name: "treeSize";
    readonly inputs: readonly [];
    readonly outputs: readonly [{
        readonly name: "";
        readonly type: "uint32";
        readonly internalType: "uint32";
    }];
    readonly stateMutability: "view";
}, {
    readonly type: "function";
    readonly name: "unpause";
    readonly inputs: readonly [];
    readonly outputs: readonly [];
    readonly stateMutability: "nonpayable";
}, {
    readonly type: "event";
    readonly name: "CapsLowered";
    readonly inputs: readonly [{
        readonly name: "asset";
        readonly type: "uint8";
        readonly indexed: true;
        readonly internalType: "uint8";
    }, {
        readonly name: "perUser";
        readonly type: "uint128";
        readonly indexed: false;
        readonly internalType: "uint128";
    }, {
        readonly name: "global";
        readonly type: "uint128";
        readonly indexed: false;
        readonly internalType: "uint128";
    }];
    readonly anonymous: false;
}, {
    readonly type: "event";
    readonly name: "Delivery";
    readonly inputs: readonly [{
        readonly name: "index";
        readonly type: "uint32";
        readonly indexed: true;
        readonly internalType: "uint32";
    }, {
        readonly name: "nullifier0";
        readonly type: "uint256";
        readonly indexed: false;
        readonly internalType: "uint256";
    }, {
        readonly name: "enc0";
        readonly type: "uint256";
        readonly indexed: false;
        readonly internalType: "uint256";
    }, {
        readonly name: "enc1";
        readonly type: "uint256";
        readonly indexed: false;
        readonly internalType: "uint256";
    }];
    readonly anonymous: false;
}, {
    readonly type: "event";
    readonly name: "GuardianChanged";
    readonly inputs: readonly [{
        readonly name: "guardian";
        readonly type: "address";
        readonly indexed: false;
        readonly internalType: "address";
    }];
    readonly anonymous: false;
}, {
    readonly type: "event";
    readonly name: "NotesInserted";
    readonly inputs: readonly [{
        readonly name: "index";
        readonly type: "uint32";
        readonly indexed: true;
        readonly internalType: "uint32";
    }, {
        readonly name: "commitment0";
        readonly type: "uint256";
        readonly indexed: false;
        readonly internalType: "uint256";
    }, {
        readonly name: "commitment1";
        readonly type: "uint256";
        readonly indexed: false;
        readonly internalType: "uint256";
    }, {
        readonly name: "ciphertext";
        readonly type: "bytes";
        readonly indexed: false;
        readonly internalType: "bytes";
    }];
    readonly anonymous: false;
}, {
    readonly type: "event";
    readonly name: "OwnershipTransferStarted";
    readonly inputs: readonly [{
        readonly name: "pendingOwner";
        readonly type: "address";
        readonly indexed: false;
        readonly internalType: "address";
    }];
    readonly anonymous: false;
}, {
    readonly type: "event";
    readonly name: "OwnershipTransferred";
    readonly inputs: readonly [{
        readonly name: "owner";
        readonly type: "address";
        readonly indexed: false;
        readonly internalType: "address";
    }];
    readonly anonymous: false;
}, {
    readonly type: "event";
    readonly name: "Paused";
    readonly inputs: readonly [{
        readonly name: "by";
        readonly type: "address";
        readonly indexed: false;
        readonly internalType: "address";
    }];
    readonly anonymous: false;
}, {
    readonly type: "event";
    readonly name: "Shielded";
    readonly inputs: readonly [{
        readonly name: "depositor";
        readonly type: "address";
        readonly indexed: true;
        readonly internalType: "address";
    }, {
        readonly name: "asset";
        readonly type: "uint8";
        readonly indexed: true;
        readonly internalType: "uint8";
    }, {
        readonly name: "amount";
        readonly type: "uint256";
        readonly indexed: false;
        readonly internalType: "uint256";
    }, {
        readonly name: "label";
        readonly type: "uint256";
        readonly indexed: false;
        readonly internalType: "uint256";
    }];
    readonly anonymous: false;
}, {
    readonly type: "event";
    readonly name: "Spent";
    readonly inputs: readonly [{
        readonly name: "nullifier0";
        readonly type: "uint256";
        readonly indexed: false;
        readonly internalType: "uint256";
    }, {
        readonly name: "nullifier1";
        readonly type: "uint256";
        readonly indexed: false;
        readonly internalType: "uint256";
    }, {
        readonly name: "asset";
        readonly type: "uint8";
        readonly indexed: true;
        readonly internalType: "uint8";
    }, {
        readonly name: "publicAmount";
        readonly type: "uint64";
        readonly indexed: false;
        readonly internalType: "uint64";
    }, {
        readonly name: "recipient";
        readonly type: "address";
        readonly indexed: true;
        readonly internalType: "address";
    }];
    readonly anonymous: false;
}, {
    readonly type: "event";
    readonly name: "Unpaused";
    readonly inputs: readonly [{
        readonly name: "by";
        readonly type: "address";
        readonly indexed: false;
        readonly internalType: "address";
    }];
    readonly anonymous: false;
}, {
    readonly type: "error";
    readonly name: "AmountTooLarge";
    readonly inputs: readonly [];
}, {
    readonly type: "error";
    readonly name: "BadHasher";
    readonly inputs: readonly [];
}, {
    readonly type: "error";
    readonly name: "Blocked";
    readonly inputs: readonly [];
}, {
    readonly type: "error";
    readonly name: "CapsCanOnlyDecrease";
    readonly inputs: readonly [];
}, {
    readonly type: "error";
    readonly name: "CiphertextTooLarge";
    readonly inputs: readonly [];
}, {
    readonly type: "error";
    readonly name: "DuplicateNullifier";
    readonly inputs: readonly [{
        readonly name: "nullifier";
        readonly type: "uint256";
        readonly internalType: "uint256";
    }];
}, {
    readonly type: "error";
    readonly name: "GlobalCapExceeded";
    readonly inputs: readonly [];
}, {
    readonly type: "error";
    readonly name: "InvalidProof";
    readonly inputs: readonly [];
}, {
    readonly type: "error";
    readonly name: "InvalidRecipient";
    readonly inputs: readonly [];
}, {
    readonly type: "error";
    readonly name: "NotFieldElement";
    readonly inputs: readonly [{
        readonly name: "value";
        readonly type: "uint256";
        readonly internalType: "uint256";
    }];
}, {
    readonly type: "error";
    readonly name: "NotGuardian";
    readonly inputs: readonly [];
}, {
    readonly type: "error";
    readonly name: "NotOwner";
    readonly inputs: readonly [];
}, {
    readonly type: "error";
    readonly name: "NotScreened";
    readonly inputs: readonly [];
}, {
    readonly type: "error";
    readonly name: "NullifierAlreadySpent";
    readonly inputs: readonly [{
        readonly name: "nullifier";
        readonly type: "uint256";
        readonly internalType: "uint256";
    }];
}, {
    readonly type: "error";
    readonly name: "PoolPaused";
    readonly inputs: readonly [];
}, {
    readonly type: "error";
    readonly name: "Reentrancy";
    readonly inputs: readonly [];
}, {
    readonly type: "error";
    readonly name: "StaleTimestamp";
    readonly inputs: readonly [];
}, {
    readonly type: "error";
    readonly name: "TransferFailed";
    readonly inputs: readonly [];
}, {
    readonly type: "error";
    readonly name: "TreeFull";
    readonly inputs: readonly [];
}, {
    readonly type: "error";
    readonly name: "UnknownAsset";
    readonly inputs: readonly [];
}, {
    readonly type: "error";
    readonly name: "UnknownAssociationRoot";
    readonly inputs: readonly [];
}, {
    readonly type: "error";
    readonly name: "UnknownRoot";
    readonly inputs: readonly [];
}, {
    readonly type: "error";
    readonly name: "UserCapExceeded";
    readonly inputs: readonly [];
}, {
    readonly type: "error";
    readonly name: "ZeroAmount";
    readonly inputs: readonly [];
}];
