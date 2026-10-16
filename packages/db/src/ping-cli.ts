import { connect, describeDatabase, pingDatabase } from "./connect.ts";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");
const target = describeDatabase(url);
console.log(`${target.database} on ${target.host} (${target.pooled ? "pooled" : "direct"})`);
const sql = connect(url, { max: 1 });
try {
  for (let attempt = 1; attempt <= 3; attempt += 1) console.log(`ping ${attempt}: ${(await pingDatabase(sql)).ms} ms`);
} finally {
  await sql.end();
}
