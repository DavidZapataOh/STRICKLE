import { DOMAIN } from "./constants.js";
import { hash } from "./poseidon.js";
export const authHash = (sk) => hash([DOMAIN.AUTH, sk]);
export const nullifierKey = (sk) => hash([DOMAIN.NK, sk]);
export const ownerPkFrom = (auth, nk) => hash([DOMAIN.PK, auth, nk]);
export const ownerPk = (sk) => ownerPkFrom(authHash(sk), nullifierKey(sk));
export const agentKeyHash = (ak) => hash([DOMAIN.AGENT, ak]);
