import { ristretto255 } from "@noble/curves/ed25519.js";
import { createProver } from "@strickle/prover";
import { nodeCircuitLoader } from "@strickle/prover/node";
import { newToken, parseConfig } from "./config.ts";
import { createService } from "./server.ts";

if (process.argv.includes("--new-token")) {
  const { token, hash } = newToken();
  console.log(`token (give it to the caller, never store it here): ${token}\nPROVER_TOKENS digest: ${hash}`);
} else {
  const config = parseConfig(process.env);
  const prover = createProver({ loadCircuit: nodeCircuitLoader(config.circuitsDir.endsWith("/") ? config.circuitsDir : `${config.circuitsDir}/`) });
  const secretKey = config.secret ? { secret: config.secret, publicKey: ristretto255.Point.BASE.multiply(config.secret).toBytes() } : undefined;
  const service = createService({ circuits: ["shield", "spend"], prover, tokenHashes: config.tokenHashes, secretKey, log: console.log });
  const port = await service.listen(config.port);
  console.log(`prover service listening on 127.0.0.1:${port}; public key 0x${Buffer.from(service.publicKey).toString("hex")}`);
  const stop = async () => {
    await service.close();
    await prover.destroy();
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}
