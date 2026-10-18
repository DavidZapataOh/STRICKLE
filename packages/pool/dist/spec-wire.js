import { isAddress } from "viem";
import { ALLOWLIST_DEPTH } from "./constants.js";
import { MerkleTree } from "./merkle.js";
import { addressToField } from "./pool-client.js";
import { recipientLeaf } from "./witness.js";
const big = (value, name) => {
    if (typeof value !== "string" || !/^[0-9]{1,80}$/.test(value))
        throw new Error(`${name} is not a decimal string`);
    return BigInt(value);
};
const text = (value) => value.toString();
export const noteToWire = (n) => ({ ...n, amount: text(n.amount), ownerPk: text(n.ownerPk), policy: text(n.policy), label: text(n.label), lockUntil: text(n.lockUntil), salt: text(n.salt) });
export const noteFromWire = (w) => ({
    amount: big(w.amount, "amount"), ownerPk: big(w.ownerPk, "ownerPk"), policy: big(w.policy, "policy"), label: big(w.label, "label"),
    box: w.box, asset: w.asset, flags: Number(w.flags), lockUntil: big(w.lockUntil, "lockUntil"), delayFloor: Number(w.delayFloor), salt: big(w.salt, "salt"),
});
export const policyToWire = (p) => ({ ...p, floor: text(p.floor), allowlistRoot: text(p.allowlistRoot), agentKeyHash: text(p.agentKeyHash), agentCap: text(p.agentCap), templateRoot: text(p.templateRoot) });
export const policyFromWire = (w) => ({
    floor: big(w.floor, "floor"), allowlistRoot: big(w.allowlistRoot, "allowlistRoot"), restricted: w.restricted === true, agentKeyHash: big(w.agentKeyHash, "agentKeyHash"),
    agentCap: big(w.agentCap, "agentCap"), agentActions: Number(w.agentActions), releaseDelay: Number(w.releaseDelay), templateRoot: big(w.templateRoot, "templateRoot"),
});
export function specToWire(spec) {
    const input = (slot) => (slot ? { note: noteToWire(slot.note), policy: policyToWire(slot.policy), leafIndex: slot.leafIndex } : null);
    const output = (slot) => ({ note: noteToWire(slot.note) });
    return {
        inputs: [input(spec.inputs[0]), input(spec.inputs[1])],
        outputs: [output(spec.outputs[0]), output(spec.outputs[1])],
        signer: { kind: "agent", ak: text(spec.signer.ak), nk: text(spec.signer.nk), authHash: text(spec.signer.authHash) },
        publicAmount: text(spec.publicAmount ?? 0n),
        recipient: text(spec.recipient ?? 0n),
        asset: spec.asset ?? "USDC",
        now: text(spec.now ?? 0n),
        ciphertextHash: text(spec.ciphertextHash ?? 0n),
        allowlist: spec.allowlist,
        dummyNk: [text(spec.dummyNk?.[0] ?? 0n), text(spec.dummyNk?.[1] ?? 0n)],
        dummySalt: [text(spec.dummySalt?.[0] ?? 0n), text(spec.dummySalt?.[1] ?? 0n)],
        enc: [text(spec.enc?.[0] ?? 0n), text(spec.enc?.[1] ?? 0n)],
    };
}
export function specFromWire(wire, tree) {
    if (typeof wire !== "object" || wire === null)
        throw new Error("spec is not an object");
    const w = wire;
    if (w.signer?.kind !== "agent")
        throw new Error("only agent spends are proven from a spec");
    const input = (slot) => slot === null ? null : { note: noteFromWire(slot.note), policy: policyFromWire(slot.policy), leafIndex: Number(slot.leafIndex) };
    const addresses = w.allowlist?.addresses ?? [];
    if (!addresses.every((a) => typeof a === "string" && isAddress(a)))
        throw new Error("allowlist holds a non-address");
    let allowlist;
    if (w.allowlist) {
        const list = new MerkleTree(ALLOWLIST_DEPTH);
        for (const a of addresses)
            list.insert(recipientLeaf(addressToField(a)));
        allowlist = { tree: list, index: Number(w.allowlist.index) };
    }
    return {
        tree,
        inputs: [input(w.inputs[0]), input(w.inputs[1])],
        outputs: [{ note: noteFromWire(w.outputs[0].note) }, { note: noteFromWire(w.outputs[1].note) }],
        signer: { kind: "agent", ak: big(w.signer.ak, "ak"), nk: big(w.signer.nk, "nk"), authHash: big(w.signer.authHash, "authHash") },
        publicAmount: big(w.publicAmount, "publicAmount"),
        recipient: big(w.recipient, "recipient"),
        asset: w.asset,
        now: big(w.now, "now"),
        ciphertextHash: big(w.ciphertextHash, "ciphertextHash"),
        allowlist,
        dummyNk: [big(w.dummyNk[0], "dummyNk"), big(w.dummyNk[1], "dummyNk")],
        dummySalt: [big(w.dummySalt[0], "dummySalt"), big(w.dummySalt[1], "dummySalt")],
        enc: [big(w.enc[0], "enc"), big(w.enc[1], "enc")],
    };
}
