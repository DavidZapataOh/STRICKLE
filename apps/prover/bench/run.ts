import { createReadStream, readFileSync, statSync, writeFileSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { join, normalize } from "node:path";
import { createProver } from "@strickle/prover";
import { nodeCircuitLoader } from "@strickle/prover/node";
import { chromium } from "playwright-core";
import { type Plugin, createServer } from "vite";

const here = new URL(".", import.meta.url).pathname;
const circuitsDir = new URL("../../../circuits/target/", import.meta.url).pathname;
const crsDir = new URL("../../../packages/prover/crs/", import.meta.url).pathname;
const budgets = JSON.parse(readFileSync(join(here, "budgets.json"), "utf8")) as Record<string, number>;

interface Result {
  crossOriginIsolated: boolean;
  cores: number;
  threads: number;
  witnessMs: number;
  prepareMs: number;
  executeMs: number;
  proveMs: number;
  verifyMs: number;
  totalMs: number;
  ok: boolean;
  proof: string;
  publicInputs: string[];
  expectedPublicInputs: string[];
}

/** Static files with HTTP range support, as a CDN would serve them. */
function staticDir(prefix: string, directory: string): Plugin {
  return {
    name: `static-${prefix}`,
    configureServer(server) {
      server.middlewares.use(prefix, (request: IncomingMessage, response: ServerResponse, next: () => void) => {
        const file = normalize(join(directory, (request.url ?? "/").split("?")[0] ?? "/"));
        if (!file.startsWith(directory)) return next();
        let size: number;
        try {
          size = statSync(file).size;
        } catch {
          return next();
        }
        const range = request.headers.range?.match(/^bytes=(\d+)-(\d*)$/);
        const start = range ? Number(range[1]) : 0;
        const end = range ? Math.min(size - 1, range[2] ? Number(range[2]) : size - 1) : size - 1;
        response.writeHead(range ? 206 : 200, {
          "content-type": file.endsWith(".json") ? "application/json" : "application/octet-stream",
          "content-length": end - start + 1,
          "accept-ranges": "bytes",
          "cross-origin-resource-policy": "same-origin",
          ...(range ? { "content-range": `bytes ${start}-${end}/${size}` } : {}),
        });
        createReadStream(file, { start, end }).pipe(response);
      });
    },
  };
}

async function scenario(name: string, isolated: boolean, threads: number, port: number) {
  const server = await createServer({
    root: here,
    plugins: [staticDir("/circuits", circuitsDir), staticDir("/crs", crsDir)],
    server: { port, strictPort: true, headers: isolated ? { "Cross-Origin-Opener-Policy": "same-origin", "Cross-Origin-Embedder-Policy": "require-corp" } : {} },
    optimizeDeps: { exclude: ["@aztec/bb.js"] },
    logLevel: "error",
  });
  await server.listen();
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const foreign = new Set<string>();
  const runPage = async (): Promise<Result> => {
    const page = await context.newPage();
    page.on("request", (request) => {
      const { hostname } = new URL(request.url());
      if (hostname !== "localhost" && hostname !== "127.0.0.1") foreign.add(hostname);
    });
    page.on("pageerror", (error) => console.log(`[${name}] page error: ${error.message.slice(0, 200)}`));
    const hosted = process.env.BENCH_HOSTED_CRS !== "0";
    await page.goto(`http://localhost:${port}/?threads=${threads}${hosted ? `&crs=${encodeURIComponent(`http://localhost:${port}/crs`)}` : ""}`);
    await page.waitForFunction(() => (window as unknown as { benchResult?: unknown }).benchResult !== undefined, undefined, { timeout: 240_000 });
    const result = (await page.evaluate(() => (window as unknown as { benchResult: unknown }).benchResult)) as Result;
    await page.close();
    return result;
  };
  try {
    const cold = await runPage();
    const warm = await runPage();
    return { cold, warm, foreign: [...foreign] };
  } finally {
    await browser.close();
    await server.close();
  }
}

const cores = Number(process.env.BENCH_THREADS ?? Math.min(8, (await import("node:os")).availableParallelism()));
const runs = [
  { name: "single", isolated: false, threads: 1, port: 5301 },
  { name: "multi", isolated: true, threads: cores, port: 5302 },
];

const verifier = createProver({ loadCircuit: nodeCircuitLoader(circuitsDir), backend: { threads: 1 } });
const report: Record<string, unknown> = {};
const failures: string[] = [];
const fmt = (ms: number) => `${ms.toFixed(0).padStart(6)} ms`;

try {
  for (const run of runs) {
    const { cold, warm, foreign } = await scenario(run.name, run.isolated, run.threads, run.port);
    report[run.name] = { cold, warm, foreign };
    for (const [label, r] of [["cold", cold], ["warm", warm]] as const) {
      console.log(`${run.name.padEnd(6)} ${label} | witness ${fmt(r.witnessMs)} | prepare ${fmt(r.prepareMs)} | execute ${fmt(r.executeMs)} | prove ${fmt(r.proveMs)} | verify ${fmt(r.verifyMs)} | total ${fmt(r.totalMs)} | isolated ${r.crossOriginIsolated} threads ${r.threads}`);
      if (!r.ok) failures.push(`${run.name} ${label}: the page could not verify its own proof`);
      if (r.publicInputs.map((v) => BigInt(v)).join() !== r.expectedPublicInputs.map((v) => BigInt(v)).join()) failures.push(`${run.name} ${label}: public inputs differ from the witness`);
      const proof = Uint8Array.from(Buffer.from(r.proof.slice(2), "hex"));
      if (!(await verifier.verify("spend", { proof, publicInputs: r.publicInputs }))) failures.push(`${run.name} ${label}: the browser proof does not verify in Node`);
      if (run.isolated && !r.crossOriginIsolated) failures.push(`${run.name} ${label}: the page was not cross-origin isolated`);
    }
    if (foreign.length > 0) failures.push(`${run.name}: requests to third-party hosts: ${foreign.join(", ")}`);
    const proveBudget = run.isolated ? budgets.multiThreadProveMs : budgets.singleThreadProveMs;
    if ((budgets && cold.proveMs > (proveBudget as number)) || warm.proveMs > (proveBudget as number)) failures.push(`${run.name}: prove time over ${proveBudget} ms`);
    if (!run.isolated && warm.totalMs > (budgets.warmTotalMs as number)) failures.push(`${run.name}: warm total over ${budgets.warmTotalMs} ms`);
    if (cold.totalMs > (budgets.coldTotalMs as number)) failures.push(`${run.name}: cold total over ${budgets.coldTotalMs} ms`);
  }
} finally {
  await verifier.destroy();
}

writeFileSync(join(here, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
if (failures.length > 0) {
  console.error(`\nbenchmark failed:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log("\nbenchmark within budget");
