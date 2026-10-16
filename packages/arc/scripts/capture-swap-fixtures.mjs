import { createViemAdapterFromPrivateKey } from "@circle-fin/adapter-viem-v2";
import { SwapKit } from "@circle-fin/swap-kit";
import { mkdirSync, writeFileSync } from "node:fs";
import { generatePrivateKey } from "viem/accounts";

const out = new URL("../tests/fixtures/bridge/", import.meta.url);
mkdirSync(out, { recursive: true });
const kit = new SwapKit();
const adapter = createViemAdapterFromPrivateKey({ privateKey: generatePrivateKey() });
const replacer = (_key, value) => (typeof value === "bigint" ? value.toString() : value);
const save = (name, value) => writeFileSync(new URL(name, out), `${JSON.stringify(value, replacer, 2)}\n`);
const ask = (chain, tokenIn, amountIn) => kit.estimate({ from: { adapter, chain }, tokenIn, tokenOut: "USDC", amountIn, config: { slippageBps: 50, allowanceStrategy: "approve" } });

save("swap-ethereum-100.json", await ask("Ethereum", "0xdAC17F958D2ee523a2206206994597C13D831ec7", "100"));
save("swap-base-100.json", await ask("Base", "0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2", "100"));
save("swap-tiny.json", await ask("Ethereum", "0xdAC17F958D2ee523a2206206994597C13D831ec7", "0.01"));
