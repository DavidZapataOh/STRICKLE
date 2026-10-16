import { closeSync, mkdirSync, openSync, readFileSync, writeSync } from "node:fs";
import { join } from "node:path";
import { connect, describeDatabase } from "@strickle/db";
import { loadPolicy } from "../src/server/config-files.ts";
import { parseWaitlist, runWave } from "../src/server/wave-cli.ts";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");
const target = describeDatabase(url);
console.error(`wave on ${target.database} at ${target.host}`);

// The codes are secrets: they go to a file only the owner reads, never to the terminal the pilot sees.
const CODES_DIR = process.env.INVITE_CODES_DIR ?? "/Users/david/tameion/invites";

function writeCodes(label: string, codes: string[]): string {
  mkdirSync(CODES_DIR, { recursive: true, mode: 0o700 });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const path = join(CODES_DIR, `${stamp}-${label.replace(/ /g, "-")}.txt`);
  const fd = openSync(path, "wx", 0o600);
  try {
    writeSync(fd, `${codes.join("\n")}\n`);
  } finally {
    closeSync(fd);
  }
  return path;
}

const sql = connect(url, { max: 1 });
try {
  const result = await runWave(process.argv.slice(2), {
    sql,
    policy: loadPolicy().policy,
    now: new Date(),
    writeCodes,
    readWaitlist: (file) => parseWaitlist(readFileSync(file, "utf8")),
  });
  for (const line of result.lines) console.log(line);
  process.exitCode = result.ok ? 0 : 1;
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await sql.end();
}
