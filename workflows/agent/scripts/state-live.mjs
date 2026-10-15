// workflows/agent/scripts/state-live.mjs
import { readFileSync } from "node:fs";
import { createPublicClient, getAddress, http, parseAbi, parseAbiItem } from "viem";
import { executeSponsored, networks, walletsClient } from "@strickle/arc";
import { seal } from "@strickle/prover/sealed";
import { decryptState, deriveSealKey, parseMaster, profileAad } from "../enclave/keys.ts";
import { decodeProfile, encodeProfile } from "../enclave/profile.ts";

const network = networks.testnet;
const manifest = JSON.parse(readFileSync(new URL("../../../contracts/deployments/arc-testnet.json", import.meta.url), "utf8")).contracts;
const publicClient = createPublicClient({ chain: network.chain, transport: http(network.rpcUrl) });
const stateAddress = manifest.AgentState.address;
const abi = parseAbi([
  "function enclaveKey() view returns (bytes32)",
  "function submitProfile(address vault, bytes sealed)",
  "function head(address vault) view returns (uint64 version, uint64 updatedAt, uint64 applied)",
]);
const updated = parseAbiItem("event StateUpdated(address indexed vault, uint64 indexed version, bytes ciphertext)");
const factoryAbi = parseAbi(["function vaultOf(address owner) view returns (address)"]);

const circle = walletsClient("testnet");
const walletId = process.env.CIRCLE_GAS_STATION_SCA_WALLET_ID;
const owner = (await circle.getWallet({ id: walletId })).data.wallet.address;
const vault = getAddress(await publicClient.readContract({ address: manifest.BoxVaultFactory.address, abi: factoryAbi, functionName: "vaultOf", args: [owner] }));

const master = parseMaster(process.env.AGENT_MASTER_VALUE);
const enclaveKey = await publicClient.readContract({ address: stateAddress, abi, functionName: "enclaveKey" });
if (enclaveKey !== `0x${Buffer.from(deriveSealKey(master).publicKey).toString("hex")}`) throw new Error("the published enclave key is not the one derived from the master secret");

const profile = { version: 1, taxRateBps: 2000, taxBufferBps: 10500, payrollShareBps: 10000, floorDays: 14, targetDays: 42, dailySpend: "40000000", payrollDue: "0", salaryOwed: "1500000000", emergencyTarget: "9000000000" };
const [, , before] = await publicClient.readContract({ address: stateAddress, abi, functionName: "head", args: [vault] });
const sealed = seal(encodeProfile(profile), Buffer.from(enclaveKey.slice(2), "hex"), profileAad(vault));
await executeSponsored({ circle, publicClient, network, walletId, contract: stateAddress, abi, functionName: "submitProfile", args: [vault, `0x${Buffer.from(sealed).toString("hex")}`] });

const [submittedLog] = (await publicClient.getLogs({ address: stateAddress, event: parseAbiItem("event ProfileSubmitted(address indexed vault, uint64 indexed profileId, bytes sealedData)"), args: { vault }, fromBlock: (await publicClient.getBlockNumber()) - 100n })).slice(-1);
const submittedReceipt = await publicClient.getTransactionReceipt({ hash: submittedLog.transactionHash });
console.log(`submitProfile: tx ${submittedLog.transactionHash}, event index ${submittedReceipt.logs.findIndex((entry) => entry.logIndex === submittedLog.logIndex)}`);

for (let attempt = 0; ; attempt++) {
  const [, , applied] = await publicClient.readContract({ address: stateAddress, abi, functionName: "head", args: [vault] });
  if (applied > before) break;
  if (attempt === 59) throw new Error("the enclave did not publish a state in 5 minutes");
  await new Promise((resolve) => setTimeout(resolve, 5_000));
}

const [version, at] = await publicClient.readContract({ address: stateAddress, abi, functionName: "head", args: [vault] });
const [event] = await publicClient.getLogs({ address: stateAddress, event: updated, args: { vault, version }, fromBlock: at, toBlock: at });
const bytes = Buffer.from(event.args.ciphertext.slice(2), "hex");
const opened = decodeProfile(decryptState(master, vault, version, bytes));
if (opened.taxRateBps !== profile.taxRateBps || opened.emergencyTarget !== profile.emergencyTarget) throw new Error("the published state is not the submitted profile");
if (bytes.toString("latin1").includes("taxRateBps")) throw new Error("the published state contains plaintext");
let otherVaultOpened = true;
try {
  decryptState(master, getAddress("0x00000000000000000000000000000000000000ee"), version, bytes);
} catch {
  otherVaultOpened = false;
}
if (otherVaultOpened) throw new Error("another vault's key opened this state");
console.log(`state version ${version} for ${vault}: decrypts to the submitted profile, opaque on chain, closed to other vaults`);
