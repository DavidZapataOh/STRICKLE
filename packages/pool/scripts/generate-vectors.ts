import { mkdirSync, writeFileSync } from "node:fs";
import { buildVectors, renderNoirTests } from "../src/vectors.ts";

const vectors = buildVectors();
const jsonFile = new URL("../vectors/pool-vectors.json", import.meta.url);
const noirFile = new URL("../../../circuits/pool_lib/src/vectors.nr", import.meta.url);

mkdirSync(new URL("../vectors/", import.meta.url), { recursive: true });
mkdirSync(new URL("../../../circuits/pool_lib/src/", import.meta.url), { recursive: true });
writeFileSync(jsonFile, `${JSON.stringify(vectors, null, 2)}\n`);
writeFileSync(noirFile, renderNoirTests(vectors));
console.log(`vectors written: ${vectors.hash.length} hash, ${vectors.notes.length} notes, ${vectors.nullifiers.length} nullifiers`);
