import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";

const HOST = "https://crs.aztec-cdn.foundation";
const FALLBACK = "https://crs.aztec-labs.com";
const MIB4 = 4 * 1024 * 1024;
const files = [
  { name: "g1_compressed.dat", bytes: MIB4, sha256: "fad8203ae1fd103658d4bb33b2b4cf126a28352b5de4684737cff23cc15fb94b" },
  { name: "g2.dat", bytes: 128, sha256: "01797bfc4de5a96f0e516a9ea4537d18786dc30cb991aca4274c95822b69c32f" },
  { name: "grumpkin_g1_v2.dat", bytes: MIB4, sha256: "64236c9455e75aeea77a94587ea607eed2e978d2609a421d66bf10bb9698b8fd" },
];

const outDir = new URL("../crs/", import.meta.url);
mkdirSync(outDir, { recursive: true });

async function download(name, bytes) {
  for (const host of [HOST, FALLBACK]) {
    const response = await fetch(`${host}/${name}`, { headers: { Range: `bytes=0-${bytes - 1}` } });
    if (response.ok) {
      const data = Buffer.from(await response.arrayBuffer());
      if (data.length !== bytes) throw new Error(`${name}: expected ${bytes} bytes, got ${data.length}`);
      return data;
    }
  }
  throw new Error(`could not download ${name}`);
}

for (const { name, bytes, sha256 } of files) {
  const data = await download(name, bytes);
  const digest = createHash("sha256").update(data).digest("hex");
  if (digest !== sha256) throw new Error(`${name}: sha256 ${digest} is not the pinned ${sha256}`);
  writeFileSync(new URL(name, outDir), data);
  console.log(`${name} ${data.length} bytes, sha256 verified`);
}
