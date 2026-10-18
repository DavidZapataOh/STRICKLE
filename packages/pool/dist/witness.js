import { ALLOWLIST_DEPTH, ASSET_ID, ASSOCIATION_DEPTH, DOMAIN, TEMPLATE_DEPTH, TREE_DEPTH, boxId } from "./constants.js";
import { deliveryKey, deliverySalt, encryptDelivery, packDelivery } from "./delivery.js";
import { randomField, toHex32 } from "./field.js";
import { authHash, nullifierKey } from "./keys.js";
import { noteCommitment, noteNullifier } from "./note.js";
import { hash } from "./poseidon.js";
const ZERO_POLICY = {
    floor: 0n,
    allowlistRoot: 0n,
    restricted: false,
    agentKeyHash: 0n,
    agentCap: 0n,
    agentActions: 0,
    releaseDelay: 0,
    templateRoot: 0n,
};
export function noteToInputs(note) {
    return {
        amount: note.amount.toString(),
        owner_pk: toHex32(note.ownerPk),
        policy: toHex32(note.policy),
        label: toHex32(note.label),
        box_id: boxId(note.box),
        asset: ASSET_ID[note.asset],
        flags: note.flags,
        lock_until: note.lockUntil.toString(),
        delay_floor: note.delayFloor,
        salt: toHex32(note.salt),
    };
}
function policyToInputs(policy) {
    return {
        floor: policy.floor.toString(),
        allowlist_root: toHex32(policy.allowlistRoot),
        restricted: policy.restricted ? 1 : 0,
        agent_key_hash: toHex32(policy.agentKeyHash),
        agent_cap: policy.agentCap.toString(),
        agent_actions: policy.agentActions,
        release_delay: policy.releaseDelay,
        template_root: toHex32(policy.templateRoot),
    };
}
const zeros = (length) => Array.from({ length }, () => 0n);
export function recipientLeaf(recipient) {
    return hash([DOMAIN.RECIPIENT, recipient]);
}
export function buildShieldInputs(args) {
    const label = args.label ?? args.note.label;
    const commitment = noteCommitment(args.note);
    return {
        inputs: {
            commitment: toHex32(commitment),
            amount: args.note.amount.toString(),
            asset: ASSET_ID[args.note.asset],
            label: toHex32(label),
            note: noteToInputs(args.note),
        },
        publicInputs: [commitment, args.note.amount, BigInt(ASSET_ID[args.note.asset]), label],
    };
}
export function withDummies(spec) {
    return {
        ...spec,
        dummyNk: spec.dummyNk ?? [randomField(), randomField()],
        dummySalt: spec.dummySalt ?? [randomField(), randomField()],
    };
}
function signerKeys(signer) {
    return signer.kind === "user"
        ? { nk: nullifierKey(signer.sk), auth: authHash(signer.sk), secret: signer.sk }
        : { nk: signer.nk, auth: signer.authHash, secret: signer.ak };
}
function inputSlots(spec, withPath = true) {
    const asset = spec.asset ?? "USDC";
    const real = spec.inputs.find((input) => input !== null);
    const { nk } = signerKeys(spec.signer);
    return spec.inputs.map((input, slot) => {
        if (input) {
            const commitment = noteCommitment(input.note);
            return {
                nullifier: noteNullifier(nk, commitment, input.leafIndex),
                circuit: {
                    note: noteToInputs(input.note),
                    policy: policyToInputs(input.policy),
                    leaf_index: input.leafIndex.toString(),
                    path: withPath ? spec.tree.path(input.leafIndex).map(toHex32) : [],
                    dummy: false,
                },
            };
        }
        const dummyNote = {
            amount: 0n,
            ownerPk: 0n,
            policy: 0n,
            label: 0n,
            box: real?.note.box ?? "operating",
            asset,
            flags: 0,
            lockUntil: 0n,
            delayFloor: 0,
            salt: spec.dummySalt[slot] ?? 0n,
        };
        return {
            nullifier: noteNullifier(spec.dummyNk[slot] ?? 0n, noteCommitment(dummyNote), 0),
            circuit: {
                note: noteToInputs(dummyNote),
                policy: policyToInputs(ZERO_POLICY),
                leaf_index: "0",
                path: zeros(TREE_DEPTH).map(toHex32),
                dummy: true,
            },
        };
    });
}
function finalOutputs(spec, nullifier0) {
    const real = spec.inputs.find((input) => input !== null);
    const { nk } = signerKeys(spec.signer);
    const inheritedDelay = spec.inputs.reduce((max, input) => (input ? Math.max(max, input.policy.releaseDelay, input.note.delayFloor) : max), 0);
    return spec.outputs.map((output, j) => {
        const isSelf = output.note.amount > 0n && real !== undefined && output.note.ownerPk === real.note.ownerPk;
        if (!isSelf)
            return { output, note: output.note, enc: spec.enc?.[j] ?? randomField() };
        const key = deliveryKey(nk, nullifier0, j);
        const note = { ...output.note, delayFloor: Math.max(output.note.delayFloor, inheritedDelay), salt: deliverySalt(key) };
        return { output, note, enc: encryptDelivery(packDelivery(note), key) };
    });
}
/** The notes a spend will actually commit and their delivery values; call `withDummies` first so the answer is stable. */
export function deriveOutputNotes(spec) {
    if (!spec.dummyNk || !spec.dummySalt)
        throw new Error("call withDummies(spec) first");
    // The Merkle path is only needed by the circuit, so deriving the notes does not require the ledger tree.
    const nullifiers = inputSlots(spec, false).map((slot) => slot.nullifier);
    const finals = finalOutputs(spec, nullifiers[0]);
    return { notes: finals.map((final) => final.note), enc: finals.map((final) => final.enc), nullifiers };
}
export function buildSpendInputs(input) {
    const spec = withDummies(input);
    const asset = spec.asset ?? "USDC";
    const now = spec.now ?? 1800000000n;
    const publicAmount = spec.publicAmount ?? 0n;
    const recipient = spec.recipient ?? 0n;
    const ciphertextHash = spec.ciphertextHash ?? 0n;
    const dummyNk = spec.dummyNk;
    const { nk: signerNk, auth: signerAuth, secret } = signerKeys(spec.signer);
    const signer = spec.signer;
    const inputNotes = inputSlots(spec);
    const nullifiers = inputNotes.map((slot) => slot.nullifier);
    const finals = finalOutputs(spec, nullifiers[0]);
    const outputs = finals.map(({ output, note }) => ({
        commitment: noteCommitment(note),
        circuit: {
            note: noteToInputs(note),
            template_index: (output.template?.index ?? 0).toString(),
            template_path: (output.template ? output.template.tree.path(output.template.index) : zeros(TEMPLATE_DEPTH)).map(toHex32),
        },
    }));
    const enc = finals.map((final) => final.enc);
    const allowlistPath = spec.allowlist ? spec.allowlist.tree.path(spec.allowlist.index) : zeros(ALLOWLIST_DEPTH);
    const associationPath = spec.association ? spec.association.tree.path(spec.association.index) : zeros(ASSOCIATION_DEPTH);
    const commitments = outputs.map((output) => output.commitment);
    const associationRoot = spec.association ? spec.association.tree.root : 0n;
    return {
        inputs: {
            root: toHex32(spec.tree.root),
            nullifiers: nullifiers.map(toHex32),
            commitments: commitments.map(toHex32),
            public_amount: publicAmount.toString(),
            recipient: toHex32(recipient),
            asset: ASSET_ID[asset],
            now: now.toString(),
            ciphertext_hash: toHex32(ciphertextHash),
            association_root: toHex32(associationRoot),
            enc: enc.map(toHex32),
            inputs: inputNotes.map((input) => input.circuit),
            outputs: outputs.map((output) => output.circuit),
            signer_kind: signer.kind === "user" ? 0 : 1,
            secret: toHex32(secret),
            owner_auth_hash: toHex32(signerAuth),
            owner_nk: toHex32(signerNk),
            dummy_nk: dummyNk.map(toHex32),
            allowlist_index: (spec.allowlist?.index ?? 0).toString(),
            allowlist_path: allowlistPath.map(toHex32),
            association_index: (spec.association?.index ?? 0).toString(),
            association_path: associationPath.map(toHex32),
        },
        publicInputs: [spec.tree.root, ...nullifiers, ...commitments, publicAmount, recipient, BigInt(ASSET_ID[asset]), now, ciphertextHash, associationRoot, ...enc],
        outputNotes: finals.map((final) => final.note),
    };
}
