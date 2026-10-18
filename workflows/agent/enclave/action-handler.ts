// workflows/agent/enclave/action-handler.ts
import { type HTTPPayload, type TeeRuntime, decodeJson } from "@chainlink/cre-sdk";
import { open } from "@strickle/prover/sealed";
import { type Address, type Hex, bytesToHex, getAddress, hexToBytes } from "viem";
import type { Config } from "../config.ts";
import { noteCommitment } from "@strickle/pool/note";
import { noteFromWire } from "@strickle/pool/spec-wire";
import { applyAction } from "./actions.ts";
import { decodeStateLog, decodeTickBooks, stateLogRequest, tickRequests } from "./books.ts";
import { ASSET_ID } from "./cascade.ts";
import { todayOf } from "./clock.ts";
import { deliver } from "./deliver.ts";
import { deliverEarn } from "./earn-deliver.ts";
import { earnFor } from "./earn-run.ts";
import { decryptState, deriveSealKey, encryptState, parseMaster } from "./keys.ts";
import type { Notice } from "./notice-schema.ts";
import { sealNotice } from "./notices.ts";
import { acceptSpend, planPrivatePay } from "./private-pay.ts";
import { buildPlanNotice } from "./plan.ts";
import { type Profile, ZERO_KEY, decodeProfile, encodeProfile } from "./profile.ts";
import { proveSpec, resolveLeaf } from "./prover-call.ts";
import { ethBatch } from "./read.ts";
import { encodeNoticeReport, encodePrivateSpendReport, encodeSalaryReport, encodeTickReport } from "./reports.ts";
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
  if (request.action.kind === "pay") {
    const action = request.action;
    if (profile.breaker.halted) return done;
    const proverToken = runtime.getSecret({ id: "PROVER_TOKEN" }).result().value;
    const note = profile.privateMode.notes.find((entry) => entry.note.box === action.box && entry.note.asset === "USDC");
    const leaf = note && (note.leafIndex ?? resolveLeaf(runtime, proverToken, noteCommitment(noteFromWire(note.note))));
    const plan = planPrivatePay({
      profile, master, vault, version, requestDigest: digest, nowSeconds: now,
      request: { box: action.box, to: getAddress(action.to), amount: BigInt(action.amount) },
      leafOf: () => leaf ?? undefined,
    });
    if (!plan.ok) return done;
    const answer = proveSpec(runtime, master, vault, plan, proverToken, now);
    const accepted = acceptSpend(plan, answer.publicInputs);
    if (!accepted.ok) return done;
    const next = version + 1n;
    const stored = { ...plan.next, nonce: request.nonce };
    deliver(
      runtime,
      executor,
      encodePrivateSpendReport({ vault, proof: answer.proof, inputs: accepted.inputs, poolCiphertext: plan.ciphertext, next, stateCiphertext: bytesToHex(encryptState(master, vault, next, encodeProfile(stored))) }),
      runtime.config.privateSpendGas,
    );
    return done;
  }

  const result = applyAction(profile, request.action, { now, today, books, earnVaults: runtime.config.earn.vaults.map((entry) => entry.address), sandboxClock: runtime.config.sandboxClock });
  if (!result.ok) return done;

  const stored = { ...result.next, nonce: request.nonce };
  // putting money to work or taking it back is carried out as soon as it is signed, so the person sees it happen; a move that cannot run now stays pending for the next tick
  if (request.action.kind === "invest" || request.action.kind === "divest") {
    const seal = (sealed: typeof stored, at: bigint) => bytesToHex(encryptState(master, vault, at, encodeProfile(sealed)));
    const moved = deliverEarn(runtime, { executor, vault, version, outcome: earnFor(runtime, { profile: stored, vault, books, today, nowSeconds: now }), seal });
    if (moved.version !== version) {
      sealNotices(runtime, { executor, master, vault, profile, count: noticeCount, notices: moved.notices });
      return done;
    }
  }

  const next = version + 1n;
  const ciphertext = bytesToHex(encryptState(master, vault, next, encodeProfile(stored)));
  deliver(
    runtime,
    executor,
    result.pay
      ? encodeSalaryReport({ vault, asset: ASSET_ID.USDC, payee: result.pay.payee, amount: result.pay.amount, seen: result.pay.seen, next, ciphertext })
      : encodeTickReport({ vault, next, ciphertext }),
  );

  // an adjust is confirmed by what is now in force, an advance by the date the account now lives in: the app reads it from this fresh plan
  const planToday = request.action.kind === "advance" ? todayOf(runtime.now(), stored.clockOffsetDays) : today;
  const notices = request.action.kind === "adjust" || request.action.kind === "advance" ? [...result.notices, buildPlanNotice({ profile: stored, books, today: planToday, vault, nowSeconds: now })] : result.notices;
  sealNotices(runtime, { executor, master, vault, profile, count: noticeCount, notices });
  return done;
};

function sealNotices(runtime: TeeRuntime<Config>, input: { executor: Address; master: Parameters<typeof sealNotice>[0]; vault: Address; profile: Profile; count: bigint; notices: Notice[] }): void {
  if (input.profile.userKey === ZERO_KEY || input.notices.length === 0) return;
  const userKey = hexToBytes(input.profile.userKey as Hex);
  input.notices.forEach((notice, index) => {
    const id = input.count + BigInt(index) + 1n;
    deliver(runtime, input.executor, encodeNoticeReport({ vault: input.vault, id, sealed: bytesToHex(sealNotice(input.master, userKey, input.vault, id, notice)) }));
  });
}
