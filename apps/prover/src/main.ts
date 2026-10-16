import { ristretto255 } from "@noble/curves/ed25519.js";
import { PoolLedger } from "@strickle/pool/ledger";
import { syncLedger } from "@strickle/pool/ledger-sync";
import { createProver } from "@strickle/prover";
import { nodeCircuitLoader } from "@strickle/prover/node";
import { http, type Address, createPublicClient } from "viem";
import { newToken, parseConfig } from "./config.ts";
import { createService } from "./server.ts";
import { createSpecResolver } from "./spec.ts";

if (process.argv.includes("--new-token")) {
  const { token, hash } = newToken();
  console.log(`token (give it to the caller, never store it here): ${token}\nPROVER_TOKENS digest: ${hash}`);
} else {
  const config = parseConfig(process.env);
  const prover = createProver({ loadCircuit: nodeCircuitLoader(config.circuitsDir.endsWith("/") ? config.circuitsDir : `${config.circuitsDir}/`) });
  const secretKey = config.secret ? { secret: config.secret, publicKey: ristretto255.Point.BASE.multiply(config.secret).toBytes() } : undefined;

  let specs;
  if (config.pool) {
    const client = createPublicClient({ transport: http(config.pool.rpcUrl) });
    const ledger = new PoolLedger();
    let from = config.pool.deployBlock;
    let running: Promise<unknown> | undefined;
    // Concurrent callers share one in-flight sync; each later sync resumes where the previous one stopped.
    const sync = () => {
      running ??= syncLedger({ client, pool: config.pool?.address as Address, fromBlock: from, ledger })
        .then((head) => {
          from = head + 1n;
        })
        .finally(() => {
          running = undefined;
        });
      return running;
    };
    await sync();
    specs = createSpecResolver({ sync, ledger });
  }

  const service = createService({ circuits: specs ? ["shield", "spend", "spend_spec"] : ["shield", "spend"], prover, tokenHashes: config.tokenHashes, secretKey, specs, log: console.log });
  const port = await service.listen(config.port, config.host);
  console.log(`prover service listening on ${config.host}:${port}; public key 0x${Buffer.from(service.publicKey).toString("hex")}`);
  const stop = async () => {
    await service.close();
    await prover.destroy();
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}
