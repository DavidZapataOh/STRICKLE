// Writes a real report the forwarder delivered to the agent's state on Arc testnet, and the DON signers read from the registry on Ethereum, as test fixtures.
//   node scripts/capture-attestation.ts
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { networks, rpcUrl } from "@strickle/arc/networks";
import { createPublicClient, http, toHex } from "viem";
import { mainnet } from "viem/chains";
import { latestReport, parseHeader, registrySigners, verifyReport } from "../src/server/attestation.ts";

const manifest = JSON.parse(readFileSync(new URL("../../../contracts/deployments/arc-testnet.json", import.meta.url), "utf8")).contracts;
const arc = createPublicClient({ chain: networks.testnet.chain, transport: http(rpcUrl("testnet")) });
const ethereum = createPublicClient({ chain: mainnet, transport: http(process.env.ETHEREUM_RPC_URL ?? "https://ethereum-rpc.publicnode.com") });

const report = await latestReport(arc, [manifest.AgentHeartbeat.address, manifest.AgentState.address, manifest.AgentExecutor.address], "0x76c9cf548b4179F8901cda1f8623568b58215E62");
if (!report) throw new Error("no report delivered to the agent's receivers yet: let the workflow run and try again");
const header = parseHeader(report.raw);
const recorded: { data: string; result: string }[] = [];
const recording = { call: async (args: { to: `0x${string}`; data: `0x${string}` }) => { const answer = await ethereum.call(args); recorded.push({ data: args.data, result: answer.data ?? "0x" }); return answer; } } as unknown as typeof ethereum;
const { f, signers } = await registrySigners(recording, header.donId);
const checked = await verifyReport({ raw: report.raw, context: report.context, signatures: report.signatures, signers, f });
console.log(`report ${report.tx}: DON ${header.donId}, workflow ${header.workflowId}, ${checked.valid} of ${checked.threshold} signatures needed, ok ${checked.ok}`);
const out = new URL("../tests/fixtures/attestation/", import.meta.url);
mkdirSync(out, { recursive: true });
writeFileSync(new URL("report.json", out), `${JSON.stringify({ tx: report.tx, receiver: report.receiver, at: report.at, raw: toHex(report.raw), context: toHex(report.context), signatures: report.signatures }, null, 2)}\n`);
writeFileSync(new URL("registry-calls.json", out), `${JSON.stringify(recorded, null, 2)}\n`);
writeFileSync(new URL("signers.json", out), `${JSON.stringify({ donId: header.donId, f, signers: [...signers].sort() }, null, 2)}\n`);
