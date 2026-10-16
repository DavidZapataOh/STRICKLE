// usage: node --env-file=/Users/david/tameion/.env apps/app/scripts/read-state.mjs <vault>
import { createPublicClient, getAddress, http, parseAbi, parseAbiItem } from "viem";
import { networks } from "@strickle/arc/networks";
import { decryptState, parseMaster } from "../../../workflows/agent/enclave/keys.ts";
import { decodeProfile } from "../../../workflows/agent/enclave/profile.ts";
import { build } from "./sync-deployments.mjs";

const vault = getAddress(process.argv[2] ?? "");
const { AgentState } = build().testnet;
const client = createPublicClient({ transport: http(networks.testnet.rpcUrl) });
const head = parseAbi(["function head(address vault) view returns (uint64 version, uint64 at, uint64 applied)"]);
const updated = parseAbiItem("event StateUpdated(address indexed vault, uint64 indexed version, bytes ciphertext)");

const [version, at] = await client.readContract({ address: AgentState, abi: head, functionName: "head", args: [vault] });
if (version === 0n) throw new Error("the enclave has not stored a state for this vault yet");
const [event] = await client.getLogs({ address: AgentState, event: updated, args: { vault, version }, fromBlock: at, toBlock: at });
if (!event) throw new Error("the state event was not found at the head block");
const ciphertext = Uint8Array.from(Buffer.from(event.args.ciphertext.slice(2), "hex"));
console.log(JSON.stringify(decodeProfile(decryptState(parseMaster(process.env.AGENT_MASTER_VALUE), vault, version, ciphertext)), null, 2));
