import { type Rate, deviationBps } from "@strickle/core";
import { type Address, type Hex, encodeFunctionData, parseAbi, zeroAddress } from "viem";
import { z } from "zod";
import type { SwapConfig } from "../config.ts";
import type { SwapIntent } from "./swap-plan.ts";

/** `execute` of Circle's Adapter, as read from the verified contract; the vault only ever calls this selector. */
export const adapterAbi = parseAbi([
  "function execute((( address target, bytes data, uint256 value, address tokenIn, uint256 amountToApprove, address tokenOut, uint256 minTokenOut)[] instructions, (address token, address beneficiary)[] tokens, uint256 execId, uint256 deadline, bytes metadata) params, (uint8 permitType, address token, uint256 amount, bytes permitCalldata)[] tokenInputs, bytes signature) payable",
]);

export const MIN_DEADLINE_SECONDS = 120;
export const MAX_DEADLINE_SECONDS = 3_600;

const UINT_MAX = 2n ** 256n - 1n;
const address = z.string().regex(/^0x[0-9a-fA-F]{40}$/);
const hex = z.string().regex(/^0x([0-9a-fA-F]{2})*$/);
const number = z
  .string()
  .regex(/^(0x[0-9a-fA-F]+|[0-9]+)$/)
  .refine((value) => BigInt(value) <= UINT_MAX);
const responseSchema = z
  .object({
    estimatedAmount: z.string().regex(/^[0-9]+$/).refine((value) => BigInt(value) <= UINT_MAX),
    transaction: z
      .object({
        signature: hex,
        gasLimit: number,
        executionParams: z
          .object({
            execId: number,
            deadline: number,
            metadata: hex,
            tokens: z.array(z.object({ token: address, beneficiary: address }).passthrough()).min(1).max(4),
            instructions: z.array(z.object({ target: address, data: hex, value: number, tokenIn: address, amountToApprove: number, tokenOut: address, minTokenOut: number }).passthrough()).min(1).max(8),
          })
          .passthrough(),
      })
      .passthrough(),
  })
  .passthrough();

export function quoteBody(input: { vault: Address; intent: SwapIntent; chain: "Arc_Testnet" | "Arc"; usdc: Address; eurc: Address }): string {
  const [tokenIn, tokenOut] = input.intent.assetIn === "USDC" ? [input.usdc, input.eurc] : [input.eurc, input.usdc];
  return JSON.stringify({
    tokenInAddress: tokenIn,
    tokenInChain: input.chain,
    tokenOutAddress: tokenOut,
    tokenOutChain: input.chain,
    fromAddress: input.vault,
    toAddress: input.vault,
    amount: input.intent.amountIn.toString(),
    stopLimit: input.intent.minOut.toString(),
    provider: "lifi",
  });
}

/** The provider's fee in basis points of the amount swapped, from the answer's own figure; zero when the answer carries none. */
export function providerFeeBps(response: unknown, amountIn: bigint): number {
  const amount = (response as { fees?: { provider?: { amount?: unknown }[] } } | null)?.fees?.provider?.[0]?.amount;
  if (typeof amount !== "string" || !/^[0-9]{1,30}$/.test(amount) || amountIn <= 0n) return 0;
  const bps = (BigInt(amount) * 10_000n) / amountIn;
  return bps > 10_000n ? 10_000 : Number(bps);
}

export type Checked =
  | { ok: true; data: Hex; estimated: bigint; gasLimit: bigint }
  | { ok: false; reason: "shape" | "beneficiary" | "token" | "deadline" | "below-minimum" | "worse-than-reference" | "better-than-reference" };

const fail = (reason: Extract<Checked, { ok: false }>["reason"]): Checked => ({ ok: false, reason });

/** Circle's answer is data from outside the enclave's trust: nothing becomes a report unless every check here passes. */
function check(input: { response: unknown; vault: Address; intent: SwapIntent; rate: Rate; now: number; config: SwapConfig; usdc: Address; eurc: Address }): Checked {
  const parsed = responseSchema.safeParse(input.response);
  if (!parsed.success) return fail("shape");
  const { estimatedAmount, transaction } = parsed.data;
  const params = transaction.executionParams;
  const vault = input.vault.toLowerCase();
  const tokens = new Set([input.usdc.toLowerCase(), input.eurc.toLowerCase()]);

  if (!params.tokens.every((entry) => entry.beneficiary.toLowerCase() === vault)) return fail("beneficiary");
  if (!params.tokens.every((entry) => tokens.has(entry.token.toLowerCase()))) return fail("token");
  if (!params.instructions.every((entry) => tokens.has(entry.tokenIn.toLowerCase()) && (entry.tokenOut === zeroAddress || tokens.has(entry.tokenOut.toLowerCase())))) return fail("token");

  // the vault calls the adapter with no ETH, so a payload that needs some cannot work
  if (!params.instructions.every((entry) => BigInt(entry.value) === 0n)) return fail("shape");

  const wait = Number(BigInt(params.deadline)) - input.now;
  if (wait < MIN_DEADLINE_SECONDS || wait > MAX_DEADLINE_SECONDS) return fail("deadline");

  const estimated = BigInt(estimatedAmount);
  const deviation = deviationBps(estimated, input.intent.expected);
  if (deviation < -input.config.maxSlipBps) return fail("worse-than-reference");
  if (estimated < input.intent.minOut) return fail("below-minimum");
  if (deviation > input.config.ceilingBps && !input.config.sandboxFx) return fail("better-than-reference");

  const tokenIn = input.intent.assetIn === "USDC" ? input.usdc : input.eurc;
  const data = encodeFunctionData({
    abi: adapterAbi,
    functionName: "execute",
    args: [
      {
        instructions: params.instructions.map((entry) => ({ target: entry.target as Address, data: entry.data as Hex, value: BigInt(entry.value), tokenIn: entry.tokenIn as Address, amountToApprove: BigInt(entry.amountToApprove), tokenOut: entry.tokenOut as Address, minTokenOut: BigInt(entry.minTokenOut) })),
        tokens: params.tokens.map((entry) => ({ token: entry.token as Address, beneficiary: entry.beneficiary as Address })),
        execId: BigInt(params.execId),
        deadline: BigInt(params.deadline),
        metadata: params.metadata as Hex,
      },
      [{ permitType: 0, token: tokenIn, amount: input.intent.amountIn, permitCalldata: "0x" }],
      transaction.signature as Hex,
    ],
  });
  return { ok: true, data, estimated, gasLimit: BigInt(transaction.gasLimit) };
}

/** A malformed answer that slips past the shape check and breaks the encoding is still just a refused answer. */
export function checkQuote(input: Parameters<typeof check>[0]): Checked {
  try {
    return check(input);
  } catch {
    return fail("shape");
  }
}
