// workflows/agent/enclave/action-handler.ts
import { type HTTPPayload, type TeeRuntime, decodeJson } from "@chainlink/cre-sdk";
import { open } from "@strickle/prover/sealed";
import { type Address, type Hex, bytesToHex, getAddress, hexToBytes } from "viem";
import type { Config } from "../config.ts";
import { applyAction } from "./actions.ts";
import { decodeStateLog, decodeTickBooks, stateLogRequest, tickRequests } from "./books.ts";
import { ASSET_ID } from "./cascade.ts";
import { todayOf } from "./clock.ts";
import { deliver } from "./deliver.ts";
import { decryptState, deriveSealKey, encryptState, parseMaster } from "./keys.ts";
import { sealNotice } from "./notices.ts";
import { ZERO_KEY, decodeProfile, encodeProfile } from "./profile.ts";
import { ethBatch } from "./read.ts";
import { encodeNoticeReport, encodeSalaryReport, encodeTickReport } from "./reports.ts";
import { codeRequest, decodeOwner, isContract, ownerRequest } from "./rpc.ts";
import { actionDigest, ecrecoverRequest, envelopeSchema, erc1271Accepts, erc1271Request, recoveredSigner, requestAad, requestSchema } from "./signed.ts";

const MAX_DEADLINE_AHEAD = 600;

// Every outcome returns the same word: a reason derived from encrypted state would be information.
export const onUserAction = (runtime: TeeRuntime<Config>, payload: HTTPPayload): string => {
  const done = "ok";
  let raw: unknown;
  try {
    raw = decodeJson(payload.input);
  } catch {
    return done;
  }
  const envelope = envelopeSchema.safeParse(raw);
  if (!envelope.success) return done;
  const vault = getAddress(envelope.data.vault);

  const master = parseMaster(runtime.getSecret({ id: "AGENT_MASTER" }).result().value);
  const key = deriveSealKey(master);
  const opened = open(hexToBytes(envelope.data.sealed as Hex), key.secret, key.publicKey, requestAad(vault));
  if (!opened) return done;
  let inner: unknown;
  try {
    inner = JSON.parse(new TextDecoder().decode(opened));
  } catch {
    return done;
  }
  const parsed = requestSchema.safeParse(inner);
  if (!parsed.success || getAddress(parsed.data.vault) !== vault) return done;
  const request = parsed.data;

  const state = runtime.config.stateAddress as Address;
  const executor = runtime.config.executorAddress as Address;
  const now = Math.floor(runtime.now().getTime() / 1000);
  if (request.deadline < now || request.deadline > now + MAX_DEADLINE_AHEAD) return done;

  const first = ethBatch(runtime, [ownerRequest(vault), ...tickRequests(state, vault)]);
  const owner = decodeOwner(first[0]);
  const { version, at, books, notices: noticeCount } = decodeTickBooks(first.slice(1));
  if (version === 0n) return done;
  const [code, log] = ethBatch(runtime, [codeRequest(owner), stateLogRequest(state, vault, version, at)]);

  const digest = actionDigest({ executor, chainId: runtime.config.chainId, vault, action: request.action, nonce: BigInt(request.nonce), deadline: request.deadline });
  const [check] = ethBatch(runtime, [isContract(code) ? erc1271Request(owner, digest, request.signature as Hex) : ecrecoverRequest(digest, request.signature as Hex)]);
  const valid = isContract(code) ? erc1271Accepts(check) : recoveredSigner(check) === owner;
  if (!valid) return done;

  const profile = decodeProfile(decryptState(master, vault, version, decodeStateLog(log)));
  if (BigInt(request.nonce) <= BigInt(profile.nonce)) return done;

  const today = todayOf(runtime.now(), runtime.config.sandboxClock ? profile.clockOffsetDays : 0);
  const result = applyAction(profile, request.action, { now, today, books });
  if (!result.ok) return done;

  const next = version + 1n;
  const stored = { ...result.next, nonce: request.nonce };
  const ciphertext = bytesToHex(encryptState(master, vault, next, encodeProfile(stored)));
  deliver(
    runtime,
    executor,
    result.pay
      ? encodeSalaryReport({ vault, asset: ASSET_ID.USDC, payee: result.pay.payee, amount: result.pay.amount, seen: result.pay.seen, next, ciphertext })
      : encodeTickReport({ vault, next, ciphertext }),
  );

  if (profile.userKey !== ZERO_KEY && result.notices.length > 0) {
    const userKey = hexToBytes(profile.userKey as Hex);
    result.notices.forEach((notice, index) => {
      const id = noticeCount + BigInt(index) + 1n;
      deliver(runtime, executor, encodeNoticeReport({ vault, id, sealed: bytesToHex(sealNotice(master, userKey, vault, id, notice)) }));
    });
  }
  return done;
};
