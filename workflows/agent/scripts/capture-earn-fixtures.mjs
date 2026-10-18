import { mkdirSync, writeFileSync } from "node:fs";

const BASE = "https://api.circle.com/v1/earnKit";
const CHAIN = "ARC-TESTNET";
const EARN_VAULT = "0xAabbeF1D3971c710276ed41eC791BbE14CdB8E88";
// The wallet the bundle is built for must hold the amount; a quote moves nothing. The deployer holds testnet funds.
const WALLET = "0x5Bb738955aa5E5cAc67BF7C074c23dce7A8b1BB4";
const out = new URL("../tests/fixtures/earn/", import.meta.url);
mkdirSync(out, { recursive: true });
const write = (name, value) => writeFileSync(new URL(name, out), `${JSON.stringify(value, null, 2)}\n`);

const call = async (path, init) => {
  const response = await fetch(`${BASE}${path}`, init);
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`${path} answered ${response.status}: ${JSON.stringify(body)}`);
  return body;
};
const post = (path, body) => call(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

write("vaults.json", await call(`/vaults/explore?${new URLSearchParams({ chain: CHAIN, page: "1" })}`));
const request = { vaultAddress: EARN_VAULT, amount: "1", address: WALLET, chain: CHAIN };
write("deposit-quote.json", await post("/deposit/quote", request));
write("deposit.json", await post("/deposit", request));
// A withdrawal needs a real position: the service refuses a wallet with none, so it is captured after a deposit.
for (const [name, path] of [["withdrawal-quote.json", "/withdrawal/quote"], ["withdraw.json", "/withdraw"]]) {
  try {
    write(name, await post(path, request));
  } catch (error) {
    console.log(`${name} skipped: ${error.message}`);
  }
}
console.log("captured deposit and withdraw bundles for", WALLET);
