import { createViemAdapterFromPrivateKey } from "@circle-fin/adapter-viem-v2";
import { BridgeKit } from "@circle-fin/bridge-kit";
import { mkdirSync, writeFileSync } from "node:fs";
import { generatePrivateKey } from "viem/accounts";

const out = new URL("../tests/fixtures/bridge/", import.meta.url);
mkdirSync(out, { recursive: true });
const kit = new BridgeKit();
const adapter = createViemAdapterFromPrivateKey({ privateKey: generatePrivateKey() });
const vault = "0x8AB41267Adc223EF245c46537870Ae8744b9b3F8"; // a contract on Arc testnet
const base = (from, config) => ({ from: { adapter, chain: from }, to: { chain: "Arc_Testnet", recipientAddress: vault, useForwarder: true }, amount: "100", config });
const save = (name, value) => writeFileSync(new URL(name, out), `${JSON.stringify(value, (_key, item) => (typeof item === "bigint" ? item.toString() : item), 2)}\n`);

const strip = ({ quote, ...rest }) => ({ ...rest, ...(quote ? { quote: "<opaque>" } : {}) });
save("estimate-destination.json", strip(await kit.estimate(base("Base_Sepolia", { transferSpeed: "FAST" }))));
save("estimate-source.json", strip(await kit.estimate(base("Base_Sepolia", { transferSpeed: "SLOW", feePayment: "source" }))));
try {
  await kit.estimate(base("Avalanche_Fuji", { transferSpeed: "FAST", feePayment: "source" }));
  throw new Error("Avalanche Fuji now supports receive-exact: update the registry notes and the negotiation test");
} catch (error) {
  if (error.message?.startsWith("Avalanche Fuji now")) throw error;
  save("error-source-unsupported.json", { message: String(error.message) });
}

import { createPublicClient, http, parseAbiItem } from "viem";
const arc = createPublicClient({ transport: http("https://rpc.blockdaemon.testnet.arc.io") });
const head = await arc.getBlockNumber();
const logs = await arc.getLogs({ address: "0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275", event: parseAbiItem("event MessageReceived(address indexed caller, uint32 sourceDomain, bytes32 indexed nonce, bytes32 sender, uint32 indexed finalityThresholdExecuted, bytes messageBody)"), fromBlock: head - 9000n, toBlock: head });
const latest = logs.at(-1);
const iris = await (await fetch(`https://iris-api-sandbox.circle.com/v2/messages/${latest.args.sourceDomain}?nonce=${latest.args.nonce}`)).json();
save("iris-complete.json", iris);
const forward = iris.messages[0].forwardTxHash;
const receipt = await arc.getTransactionReceipt({ hash: forward });
save("arrival-receipt.json", { forwardTxHash: forward, logs: receipt.logs.map((log) => ({ address: log.address, topics: log.topics, data: log.data, logIndex: log.logIndex })) });
