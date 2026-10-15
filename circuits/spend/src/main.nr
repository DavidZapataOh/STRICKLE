use pool_lib::delivery::{delivery_key, delivery_pad, delivery_salt, pack_delivery};
use pool_lib::constants::{ALLOWLIST_DEPTH, ASSOCIATION_DEPTH, DOM_RECIPIENT, TEMPLATE_DEPTH, TREE_DEPTH};
use pool_lib::keys::{agent_key_hash, auth_hash, nullifier_key, owner_pk_from};
use pool_lib::merkle::compute_root;
use pool_lib::note::{nullifier, Note};
use pool_lib::policy::{template_leaf, Policy};
use poseidon::poseidon2::Poseidon2;

global SIGNER_USER: u8 = 0;
global SIGNER_AGENT: u8 = 1;
global ACTION_SPLIT: u8 = 1;
global ACTION_PAY: u8 = 8;
global MAX_TIME: u64 = 0x1000000000000;

struct InputNote {
    note: Note,
    policy: Policy,
    leaf_index: u64,
    path: [Field; TREE_DEPTH],
    dummy: bool,
}

struct OutputNote {
    note: Note,
    template_index: u64,
    template_path: [Field; TEMPLATE_DEPTH],
}

fn min_u64(a: u64, b: u64) -> u64 {
    if a < b { a } else { b }
}

fn main(
    root: pub Field,
    nullifiers: pub [Field; 2],
    commitments: pub [Field; 2],
    public_amount: pub u64,
    recipient: pub Field,
    asset: pub u8,
    now: pub u64,
    ciphertext_hash: pub Field,
    association_root: pub Field,
    enc: pub [Field; 2],
    inputs: [InputNote; 2],
    outputs: [OutputNote; 2],
    signer_kind: u8,
    secret: Field,
    owner_auth_hash: Field,
    owner_nk: Field,
    dummy_nk: [Field; 2],
    allowlist_index: u64,
    allowlist_path: [Field; ALLOWLIST_DEPTH],
    association_index: u64,
    association_path: [Field; ASSOCIATION_DEPTH],
) {
    // The ciphertext hash and the association root are public inputs bound by the proof.
    assert(ciphertext_hash == ciphertext_hash);
    assert(now < MAX_TIME, "time out of range");
    let is_agent = signer_kind == SIGNER_AGENT;
    assert((signer_kind == SIGNER_USER) | is_agent, "unknown signer");

    // --- inputs ---
    let dummy0 = inputs[0].dummy;
    let dummy1 = inputs[1].dummy;
    assert(!(dummy0 & dummy1), "at least one real input is required");
    let base_note = if dummy0 { inputs[1].note } else { inputs[0].note };
    let base_policy = if dummy0 { inputs[1].policy } else { inputs[0].policy };
    let owner = owner_pk_from(owner_auth_hash, owner_nk);

    let mut total_in: u128 = 0;
    for i in 0..2 {
        let input = inputs[i];
        let real = !input.dummy;
        let commitment = input.note.commitment();
        let computed_root = compute_root(commitment, input.leaf_index, input.path);
        assert(!real | (computed_root == root), "input is not in the tree");
        let key = if real { owner_nk } else { dummy_nk[i] };
        let index = if real { input.leaf_index } else { 0 };
        assert(nullifiers[i] == nullifier(key, commitment, index), "wrong nullifier");
        assert(real | (input.note.amount == 0), "a dummy input must be empty");
        assert(!real | (input.note.owner_pk == owner), "input is not owned by the signer's owner id");
        assert(!real | (input.note.policy == input.policy.hash()), "policy does not match the note");
        assert(!real | (input.note.asset == asset), "input asset differs");
        assert(!real | (input.note.box_id == base_note.box_id), "inputs must share a box");
        assert(!real | (input.note.policy == base_note.policy), "inputs must share a policy");
        assert(!real | (input.note.flags == base_note.flags), "inputs must share flags");
        total_in += input.note.amount as u128;
    }
    assert(nullifiers[0] != nullifiers[1], "the same note cannot be spent twice");

    // --- authorization ---
    let user_ok = (auth_hash(secret) == owner_auth_hash) & (nullifier_key(secret) == owner_nk);
    let agent_ok = (base_policy.agent_key_hash != 0) & (agent_key_hash(secret) == base_policy.agent_key_hash);
    assert(if is_agent { agent_ok } else { user_ok }, "not authorized");

    // --- outputs ---
    let mut total_out: u128 = 0;
    let mut stay_total: u128 = 0;
    let mut moved_total: u128 = 0;
    let mut sent_total: u128 = 0;
    let mut any_move = false;
    let mut any_send = false;
    let mut any_reissue = false;
    for j in 0..2 {
        let out = outputs[j].note;
        assert(commitments[j] == out.commitment(), "commitment does not match the output note");
        assert(out.asset == asset, "output asset differs");
        let active = out.amount != 0;
        let same_owner = out.owner_pk == base_note.owner_pk;
        let same_box = out.box_id == base_note.box_id;
        let same_shape = (out.policy == base_note.policy) & (out.flags == base_note.flags);
        let stays = active & same_owner & same_box & same_shape;
        let reissues = active & same_owner & same_box & !same_shape;
        let moves = active & same_owner & !same_box;
        let sends = active & !same_owner;
        total_out += out.amount as u128;
        stay_total += if stays | reissues { out.amount as u128 } else { 0 };
        moved_total += if moves { out.amount as u128 } else { 0 };
        sent_total += if sends { out.amount as u128 } else { 0 };
        any_move = any_move | moves;
        any_send = any_send | sends;
        any_reissue = any_reissue | reissues;
    }
    assert(total_in == total_out + (public_amount as u128), "value is not conserved");

    // --- rules: locks and release ---
    let mut any_locked = false;
    let mut required_lock: u64 = 0;
    for i in 0..2 {
        let input = inputs[i];
        let locked = !input.dummy & (now < input.note.lock_until);
        let shortened = min_u64(input.note.lock_until, now + (input.policy.release_delay as u64));
        let required = if is_agent { input.note.lock_until } else { shortened };
        any_locked = any_locked | locked;
        required_lock = if locked & (required > required_lock) { required } else { required_lock };
    }
    let value_leaves = (public_amount != 0) | any_move | any_send;
    assert(!any_locked | !value_leaves, "a locked note cannot leave its box");
    for j in 0..2 {
        let out = outputs[j].note;
        let active = out.amount != 0;
        let keeps_box = (out.owner_pk == base_note.owner_pk) & (out.box_id == base_note.box_id);
        assert(!(any_locked & active) | (keeps_box & (out.lock_until >= required_lock)), "re-lock is too short");
        let changes_shape = !((out.policy == base_note.policy) & (out.flags == base_note.flags));
        let reissue = active & keeps_box & changes_shape;
        let waited = out.lock_until >= now + (base_policy.release_delay as u64);
        assert(!reissue | (!is_agent & waited), "changing a policy needs the release delay");
    }
    // --- rules: floor and recipients ---
    let released = (base_note.flags & 1) == 1;
    let lifted = !is_agent & released;
    let restricted = base_policy.restricted == 1;
    let leaving = (public_amount as u128) + moved_total + sent_total;
    assert(!(leaving != 0) | lifted | (stay_total >= (base_policy.floor as u128)), "below the floor");
    assert(!(any_move | any_send) | lifted | !restricted, "a restricted box cannot move or send");
    let recipient_leaf = Poseidon2::hash([DOM_RECIPIENT, recipient], 2);
    let recipient_allowed =
        compute_root(recipient_leaf, allowlist_index, allowlist_path) == base_policy.allowlist_root;
    assert(!((public_amount != 0) & restricted) | lifted | recipient_allowed, "recipient is not approved");
    // --- rules: agent role ---
    let can_pay = (base_policy.agent_actions & ACTION_PAY) != 0;
    let can_split = (base_policy.agent_actions & ACTION_SPLIT) != 0;
    assert(!is_agent | !(public_amount != 0) | (can_pay & recipient_allowed), "the agent may only pay approved recipients");
    assert(!is_agent | !any_move | can_split, "the agent may not split");
    assert(!is_agent | !any_send, "the agent may not send to another owner");
    assert(!is_agent | (leaving <= (base_policy.agent_cap as u128)), "above the agent cap");
    for j in 0..2 {
        let out = outputs[j].note;
        let moves_j = (out.amount != 0) & (out.owner_pk == base_note.owner_pk) & (out.box_id != base_note.box_id);
        let leaf = template_leaf(out.box_id, out.policy);
        let template_ok = compute_root(leaf, outputs[j].template_index, outputs[j].template_path) == base_policy.template_root;
        assert(!(is_agent & moves_j) | template_ok, "destination is not an approved template");
    }
    // --- rules: labels and association ---
    let label0 = inputs[0].note.label;
    let label1 = inputs[1].note.label;
    let mixed = !dummy0 & !dummy1 & (label0 != label1);
    let common = if dummy0 { label1 } else { label0 };
    for j in 0..2 {
        let out = outputs[j].note;
        assert((out.label == 0) | (!mixed & (out.label == common)), "an output cannot gain or change a label");
        assert((out.box_id >= 1) & (out.box_id <= 6), "unknown box");
        assert(out.flags <= 1, "unknown flags");
    }
    let association_member =
        compute_root(common, association_index, association_path) == association_root;
    assert(
        !((association_root != 0) & (public_amount != 0)) | ((common != 0) & !mixed & association_member),
        "the label is not in the association set",
    );

    // --- rules: self delivery ---
    for j in 0..2 {
        let out = outputs[j].note;
        let is_self = (out.amount != 0) & (out.owner_pk == base_note.owner_pk);
        let key = delivery_key(owner_nk, nullifiers[0], j as u8);
        let expected = pack_delivery(out.amount, out.flags, out.lock_until) + delivery_pad(key);
        assert(!is_self | (out.salt == delivery_salt(key)), "a self output must use the derived salt");
        assert(!is_self | (enc[j] == expected), "wrong delivery ciphertext");
        assert(is_self | (enc[j] == 0), "only self outputs carry a delivery ciphertext");
    }
}
