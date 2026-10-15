use crate::constants::{DOM_NOTE, DOM_NULLIFIER};
use poseidon::poseidon2::Poseidon2;

pub struct Note {
    pub amount: u64,
    pub owner_pk: Field,
    pub policy: Field,
    pub label: Field,
    pub box_id: u8,
    pub asset: u8,
    pub flags: u8,
    pub lock_until: u64,
    pub delay_floor: u32,
    pub salt: Field,
}

impl Note {
    pub fn meta(self) -> Field {
        (self.box_id as Field)
            + (self.asset as Field) * 0x100
            + (self.flags as Field) * 0x10000
            + (self.lock_until as Field) * 0x100000000
            + (self.delay_floor as Field) * 0x1000000000000000000000000
    }

    pub fn commitment(self) -> Field {
        Poseidon2::hash(
            [DOM_NOTE, self.amount as Field, self.owner_pk, self.policy, self.label, self.meta(), self.salt],
            7,
        )
    }
}

pub fn nullifier(nk: Field, commitment: Field, leaf_index: u64) -> Field {
    Poseidon2::hash([DOM_NULLIFIER, nk, commitment, leaf_index as Field], 4)
}
