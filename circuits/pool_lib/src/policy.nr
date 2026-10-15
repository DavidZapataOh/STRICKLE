use crate::constants::DOM_POLICY;
use poseidon::poseidon2::Poseidon2;

pub struct Policy {
    pub floor: u64,
    pub allowlist_root: Field,
    pub restricted: u8,
    pub agent_key_hash: Field,
    pub agent_cap: u64,
    pub agent_actions: u8,
    pub release_delay: u32,
}

impl Policy {
    pub fn hash(self) -> Field {
        Poseidon2::hash(
            [
                DOM_POLICY,
                self.floor as Field,
                self.allowlist_root,
                self.restricted as Field,
                self.agent_key_hash,
                self.agent_cap as Field,
                self.agent_actions as Field,
                self.release_delay as Field,
            ],
            8,
        )
    }
}
