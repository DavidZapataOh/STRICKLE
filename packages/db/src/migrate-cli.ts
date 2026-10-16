import { confirmTarget, connect, describeDatabase } from "./connect.ts";
import { migrate } from "./migrate.ts";

const url = process.env.DATABASE_URL_DIRECT ?? process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");
const confirmed = process.argv.find((arg) => arg.startsWith("--confirm-host="))?.slice("--confirm-host=".length);
const target = describeDatabase(url);
confirmTarget(url, confirmed);
console.log(`migrating ${target.database} on ${target.host}`);
const sql = connect(url, { max: 1 });
try {
  const applied = await migrate(sql);
  console.log(applied.length === 0 ? "nothing to apply" : `applied: ${applied.join(", ")}`);
} finally {
  await sql.end();
}
