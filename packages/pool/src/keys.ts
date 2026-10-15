import { DOMAIN } from "./constants.ts";
import { hash } from "./poseidon.ts";

export const ownerPk = (sk: bigint): bigint => hash([DOMAIN.PK, sk]);
export const nullifierKey = (sk: bigint): bigint => hash([DOMAIN.NK, sk]);
export const agentKeyHash = (ak: bigint): bigint => hash([DOMAIN.AGENT, ak]);
