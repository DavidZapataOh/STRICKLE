import { type Address, type Hex, decodeFunctionData, encodeFunctionData, formatUnits, parseAbi } from "viem";
import { z } from "zod";
import { MAX_DEADLINE_SECONDS, MIN_DEADLINE_SECONDS, adapterAbi } from "./swap-quote.ts";

/** The two calls an Earn bundle may make on the yield vault: the adapter holds the shares between them, so it is both receiver and owner. */
const vaultAbi = parseAbi(["function deposit(uint256 assets, address receiver) returns (uint256)", "function redeem(uint256 shares, address receiver, address owner) returns (uint256)"]);
const DEPOSIT = "0x6e553f65";
const REDEEM = "0xba087652";

const UINT_MAX = 2n ** 256n - 1n;
const address = z.string().regex(/^0x[0-9a-fA-F]{40}$/);
const hex = z.string().regex(/^0x([0-9a-fA-F]{2})*$/);
const number = z
  .string()
  .regex(/^(0x[0-9a-fA-F]+|[0-9]+)$/)
  .refine((value) => BigInt(value) <= UINT_MAX);
const bundleSchema = z
  .object({
    data: z
      .object({
        signature: hex,
        executionParams: z
          .object({
            execId: number,
            deadline: number,
            metadata: hex,
            tokens: z.array(z.object({ token: address, beneficiary: address }).passthrough()).min(1).max(4),
            instructions: z.tuple([z.object({ target: address, data: hex, value: number, tokenIn: address, amountToApprove: number, tokenOut: address, minTokenOut: number }).passthrough()]),
          })
          .passthrough(),
      })
      .passthrough(),
  })
  .passthrough();

/** `amount` is human units, as the service takes it; the wallet named is the box vault, whose balance and position the service checks. */
export function earnBody(input: { vault: Address; earnVault: Address; assets: bigint; chain: "ARC-TESTNET" | "ARC" }): string {
  return JSON.stringify({ vaultAddress: input.earnVault, amount: formatUnits(input.assets, 6), address: input.vault, chain: input.chain });
}

const quoteSchema = z.object({ data: z.object({ currentApy: z.number().min(0).max(10) }).passthrough() }).passthrough();

/** The yield the service quoted, in basis points of a year; zero when the answer carries none. */
export function parseEarnQuote(response: unknown): { apyBps: number } {
  const parsed = quoteSchema.safeParse(response);
  return { apyBps: parsed.success ? Math.round(parsed.data.data.currentApy * 10_000) : 0 };
}

export type EarnChecked = { ok: true; data: Hex; amount: bigint } | { ok: false; reason: "shape" | "target" | "selector" | "receiver" | "beneficiary" | "token" | "amount" | "deadline" };

const fail = (reason: Extract<EarnChecked, { ok: false }>["reason"]): EarnChecked => ({ ok: false, reason });
const same = (a: string, b: string): boolean => a.toLowerCase() === b.toLowerCase();

type Input = { response: unknown; vault: Address; earnVault: Address; adapter: Address; usdc: Address; deposit: boolean; assets: bigint; ownedShares: bigint; now: number };

/** Circle's answer is data from outside the enclave's trust: nothing becomes a report unless every check here passes. `amount` is the assets of a deposit or the shares of a withdrawal. */
function check(input: Input): EarnChecked {
  const parsed = bundleSchema.safeParse(input.response);
  if (!parsed.success) return fail("shape");
  const { signature, executionParams: params } = parsed.data.data;
  const [step] = params.instructions;
  if (BigInt(step.value) !== 0n) return fail("shape");
  if (!same(step.target, input.earnVault)) return fail("target");
  if (step.data.slice(0, 10).toLowerCase() !== (input.deposit ? DEPOSIT : REDEEM)) return fail("selector");

  const call = decodeFunctionData({ abi: vaultAbi, data: step.data as Hex });
  const [first, receiver, owner] = call.args as [bigint, Address, Address | undefined];
  if (!same(receiver, input.adapter) || (owner !== undefined && !same(owner, input.adapter))) return fail("receiver");
  if (!params.tokens.every((entry) => same(entry.beneficiary, input.vault))) return fail("beneficiary");
  const [tokenIn, tokenOut] = input.deposit ? [input.usdc, input.earnVault] : [input.earnVault, input.usdc];
  if (!params.tokens.every((entry) => same(entry.token, input.usdc) || same(entry.token, input.earnVault))) return fail("token");
  if (!same(step.tokenIn, tokenIn) || !same(step.tokenOut, tokenOut)) return fail("token");

  const amount = BigInt(step.amountToApprove);
  if (first !== amount) return fail("amount");
  if (input.deposit ? amount !== input.assets : amount === 0n || amount > input.ownedShares) return fail("amount");

  const wait = Number(BigInt(params.deadline)) - input.now;
  if (wait < MIN_DEADLINE_SECONDS || wait > MAX_DEADLINE_SECONDS) return fail("deadline");

  const data = encodeFunctionData({
    abi: adapterAbi,
    functionName: "execute",
    args: [
      {
        instructions: [{ target: step.target as Address, data: step.data as Hex, value: 0n, tokenIn: step.tokenIn as Address, amountToApprove: amount, tokenOut: step.tokenOut as Address, minTokenOut: BigInt(step.minTokenOut) }],
        tokens: params.tokens.map((entry) => ({ token: entry.token as Address, beneficiary: entry.beneficiary as Address })),
        execId: BigInt(params.execId),
        deadline: BigInt(params.deadline),
        metadata: params.metadata as Hex,
      },
      [{ permitType: 0, token: tokenIn, amount, permitCalldata: "0x" }],
      signature as Hex,
    ],
  });
  return { ok: true, data, amount };
}

/** A malformed answer that slips past the shape check and breaks the decoding is still just a refused answer. */
export function checkEarnBundle(input: Input): EarnChecked {
  try {
    return check(input);
  } catch {
    return fail("shape");
  }
}
