import { checkEnv } from "./env.ts";

const errors = checkEnv(process.env);
if (errors.length > 0) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log("env ok");
