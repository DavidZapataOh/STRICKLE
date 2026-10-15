import { DOMAIN } from "./constants.ts";
import { hash } from "./poseidon.ts";

export const authHash = (sk: bigint): bigint => hash([DOMAIN.AUTH, sk]);
export const nullifierKey = (sk: bigint): bigint => hash([DOMAIN.NK, sk]);
export const ownerPkFrom = (auth: bigint, nk: bigint): bigint => hash([DOMAIN.PK, auth, nk]);
export const ownerPk = (sk: bigint): bigint => ownerPkFrom(authHash(sk), nullifierKey(sk));
export const agentKeyHash = (ak: bigint): bigint => hash([DOMAIN.AGENT, ak]);
