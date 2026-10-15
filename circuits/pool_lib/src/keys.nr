use crate::constants::{DOM_AGENT, DOM_NK, DOM_PK};
use poseidon::poseidon2::Poseidon2;

pub fn owner_pk(sk: Field) -> Field {
    Poseidon2::hash([DOM_PK, sk], 2)
}

pub fn nullifier_key(sk: Field) -> Field {
    Poseidon2::hash([DOM_NK, sk], 2)
}

pub fn agent_key_hash(ak: Field) -> Field {
    Poseidon2::hash([DOM_AGENT, ak], 2)
}
