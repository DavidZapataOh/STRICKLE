import { DOMAIN, boxId } from "./constants.js";
import { assertUint } from "./field.js";
import { hash } from "./poseidon.js";
export const FREE_POLICY = {
    floor: 0n,
    allowlistRoot: 0n,
    restricted: false,
    agentKeyHash: 0n,
    agentCap: 0n,
    agentActions: 0,
    releaseDelay: 0,
    templateRoot: 0n,
};
function assertSmallInt(value, max, name) {
    if (!Number.isInteger(value) || value < 0 || value > max)
        throw new RangeError(`${name} must be an integer in 0..${max}`);
}
export function policyHash(policy) {
    assertUint(policy.floor, 64, "floor");
    assertUint(policy.agentCap, 64, "agentCap");
    assertSmallInt(policy.agentActions, 15, "agentActions");
    assertSmallInt(policy.releaseDelay, 2 ** 32 - 1, "releaseDelay");
    return hash([
        DOMAIN.POLICY,
        policy.floor,
        policy.allowlistRoot,
        policy.restricted ? 1n : 0n,
        policy.agentKeyHash,
        policy.agentCap,
        BigInt(policy.agentActions),
        BigInt(policy.releaseDelay),
        policy.templateRoot,
    ]);
}
export function templateLeaf(box, policy) {
    return hash([DOMAIN.TEMPLATE, BigInt(boxId(box)), policy]);
}
