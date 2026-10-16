// workflows/agent/enclave/profile-handler.ts
import { type EVMLog, type TeeRuntime, bytesToHex } from "@chainlink/cre-sdk";
import { open } from "@strickle/prover/sealed";
import { type Address, decodeEventLog, decodeFunctionResult, encodeAbiParameters, encodeFunctionData, getAddress, hexToBytes, parseAbi } from "viem";
import type { Config } from "../config.ts";
import { decodeStateLog, stateLogRequest } from "./books.ts";
import { deliver } from "./deliver.ts";
import { decryptState, deriveSealKey, encryptState, parseMaster, profileAad } from "./keys.ts";
import { decodeProfile, encodeProfile, mergeProfile } from "./profile.ts";
import { ethBatch } from "./read.ts";
import { callRequest, decodeOwner, decodeVaultOf, ownerRequest, stateAbi, vaultOfRequest } from "./rpc.ts";

const eventAbi = parseAbi(["event ProfileSubmitted(address indexed vault, uint64 indexed profileId, bytes sealed)"]);

export const onProfileSubmitted = (runtime: TeeRuntime<Config>, log: EVMLog): string => {
  const { args } = decodeEventLog({
    abi: eventAbi,
    data: bytesToHex(log.data),
    topics: log.topics.map(bytesToHex) as [`0x${string}`, ...`0x${string}`[]],
  });
  const vault = getAddress(args.vault);
  const state = runtime.config.stateAddress as Address;

  // Anyone can submit a profile for any contract that answers owner(); only a vault the factory made gets state.
  const [headAnswer, ownerAnswer] = ethBatch(runtime, [callRequest(state, encodeFunctionData({ abi: stateAbi, functionName: "head", args: [vault] }), "latest"), ownerRequest(vault)]);
  const [vaultOfAnswer] = ethBatch(runtime, [vaultOfRequest(runtime.config.factoryAddress as Address, decodeOwner(ownerAnswer))]);
  if (decodeVaultOf(vaultOfAnswer) !== vault) return "ok";
  const [version, updatedAt, applied] = decodeFunctionResult({ abi: stateAbi, functionName: "head", data: headAnswer as `0x${string}` });
  if (applied >= args.profileId) return "ok";

  const master = parseMaster(runtime.getSecret({ id: "AGENT_MASTER" }).result().value);
  const key = deriveSealKey(master);
  const opened = open(hexToBytes(args.sealed), key.secret, key.publicKey, profileAad(vault));
  if (!opened) throw new Error("profile did not open");
  const existing =
    version === 0n
      ? undefined
      : decodeProfile(decryptState(master, vault, version, decodeStateLog(ethBatch(runtime, [stateLogRequest(state, vault, version, updatedAt)])[0])));
  const profile = mergeProfile(existing, decodeProfile(opened));

  const next = version + 1n;
  const ciphertext = encryptState(master, vault, next, encodeProfile(profile));
  const payload = encodeAbiParameters(
    [{ type: "address" }, { type: "uint64" }, { type: "uint64" }, { type: "bytes" }],
    [vault, next, args.profileId, bytesToHex(ciphertext)],
  );
  deliver(runtime, state, payload);
  return "ok";
};
