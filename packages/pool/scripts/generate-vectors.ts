import { mkdirSync, writeFileSync } from "node:fs";
import { buildVectors, renderNoirMerkleTests, renderNoirTests, renderSolidityZeros } from "../src/vectors.ts";

const vectors = buildVectors();
const jsonFile = new URL("../vectors/pool-vectors.json", import.meta.url);
const noirFile = new URL("../../../circuits/pool_lib/src/vectors.nr", import.meta.url);

mkdirSync(new URL("../vectors/", import.meta.url), { recursive: true });
mkdirSync(new URL("../../../circuits/pool_lib/src/", import.meta.url), { recursive: true });
writeFileSync(jsonFile, `${JSON.stringify(vectors, null, 2)}\n`);
writeFileSync(noirFile, renderNoirTests(vectors));
writeFileSync(new URL("../../../circuits/pool_lib/src/merkle_vectors.nr", import.meta.url), renderNoirMerkleTests(vectors));
mkdirSync(new URL("../../../contracts/src/pool/", import.meta.url), { recursive: true });
writeFileSync(new URL("../../../contracts/src/pool/PoolZeros.sol", import.meta.url), renderSolidityZeros(vectors));
console.log(`vectors written: ${vectors.hash.length} hash, ${vectors.notes.length} notes, ${vectors.nullifiers.length} nullifiers`);
