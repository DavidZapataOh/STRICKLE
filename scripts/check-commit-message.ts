import { readFileSync } from "node:fs";
import { checkCommitMessage } from "./commit-message.ts";

const file = process.argv[2];
if (file === undefined) {
  console.error("usage: node scripts/check-commit-message.ts <file>");
  process.exit(1);
}

const errors = checkCommitMessage(readFileSync(file, "utf8"));
if (errors.length > 0) {
  console.error(errors.join("\n"));
  process.exit(1);
}
