import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { build } from "./sync-deployments.mjs";

test("the app's addresses are the deployed ones", () => {
  const generated = JSON.parse(readFileSync(new URL("../src/chain/deployments.generated.json", import.meta.url), "utf8"));
  assert.deepEqual(generated, build());
});

test("testnet lists every contract the onboarding calls and mainnet is honestly empty until deployed", () => {
  const { testnet, mainnet } = build();
  for (const name of ["BoxVaultFactory", "AgentState", "AgentExecutor", "PolicyPool"]) assert.match(testnet[name], /^0x[0-9a-fA-F]{40}$/);
  assert.ok(mainnet === null || /^0x[0-9a-fA-F]{40}$/.test(mainnet.BoxVaultFactory));
});

test("a network with only the core contracts has no agent entries instead of being refused", () => {
  const core = { chainId: 5042, contracts: { BoxVaultFactory: { address: "0x00000000000000000000000000000000000000a1", blockNumber: 7 } } };
  const none = { chainId: 5042002, contracts: {} };
  const { mainnet, testnet } = build((name) => (name === "mainnet" ? core : none));
  assert.deepEqual(mainnet, { chainId: 5042, BoxVaultFactory: "0x00000000000000000000000000000000000000a1", AgentState: null, AgentExecutor: null, PolicyPool: null, blocks: null });
  assert.equal(testnet, null);
});
