use crate::constants::{DOM_DELIVERY_KEY, DOM_DELIVERY_PAD, DOM_DELIVERY_SALT};
use poseidon::poseidon2::Poseidon2;

pub fn delivery_key(nk: Field, nf0: Field, j: u8) -> Field {
    Poseidon2::hash([DOM_DELIVERY_KEY, nk, nf0, j as Field], 4)
}

pub fn delivery_salt(key: Field) -> Field {
    Poseidon2::hash([DOM_DELIVERY_SALT, key], 2)
}

pub fn delivery_pad(key: Field) -> Field {
    Poseidon2::hash([DOM_DELIVERY_PAD, key], 2)
}

pub fn pack_delivery(amount: u64, flags: u8, lock_until: u64) -> Field {
    (amount as Field) + (flags as Field) * 0x10000000000000000 + (lock_until as Field) * 0x1000000000000000000
}
