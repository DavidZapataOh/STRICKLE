use crate::constants::{DOM_AGENT, DOM_AUTH, DOM_NK, DOM_PK};
use poseidon::poseidon2::Poseidon2;

pub fn auth_hash(sk: Field) -> Field {
    Poseidon2::hash([DOM_AUTH, sk], 2)
}

pub fn nullifier_key(sk: Field) -> Field {
    Poseidon2::hash([DOM_NK, sk], 2)
}

pub fn owner_pk_from(auth: Field, nk: Field) -> Field {
    Poseidon2::hash([DOM_PK, auth, nk], 3)
}

pub fn owner_pk(sk: Field) -> Field {
    owner_pk_from(auth_hash(sk), nullifier_key(sk))
}

pub fn agent_key_hash(ak: Field) -> Field {
    Poseidon2::hash([DOM_AGENT, ak], 2)
}
