import { fileURLToPath } from "node:url";

export const contractName = "hello-world";

export const zkConfigPath = fileURLToPath(new URL("./managed/hello-world", import.meta.url));
