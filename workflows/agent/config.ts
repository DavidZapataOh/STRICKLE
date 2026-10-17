// workflows/agent/config.ts
import { z } from "zod";

const address = z.string().regex(/^0x[0-9a-fA-F]{40}$/);
const hash32 = z.string().regex(/^0x[0-9a-fA-F]{64}$/);

const swapSchema = z
  .object({
    circleUrl: z.string().regex(/^https:\/\/[^/]+$/),
    adapter: address,
    usdcFeed: address,
    eurcFeed: address,
    gas: z.string().regex(/^[0-9]+$/),
    minUnits: z.string().regex(/^[0-9]+$/),
    dailyCap: z.string().regex(/^[0-9]+$/),
    maxSlipBps: z.number().int().min(1).max(100),
    ceilingBps: z.number().int().min(0).max(10_000),
    // testnet's pool pays about a third over the reference price; only the ceiling is relaxed, never the lower bound
    sandboxFx: z.boolean(),
    maxFeedAgeSeconds: z.number().int().min(60),
  })
  .strict();

const earnSchema = z
  .object({
    circleUrl: z.string().regex(/^https:\/\/[^/]+$/),
    gas: z.string().regex(/^[0-9]+$/),
    // the yield vaults an owner may point a box at: the name and the protocol are what the person reads, the address is what the agent checks
    vaults: z.array(z.object({ address, name: z.string().min(1).max(40), protocol: z.string().min(1).max(24) }).strict()).min(1).max(4),
  })
  .strict();

export const configSchema = z
  .object({
  schedule: z.string().min(1),
  chainName: z.literal("arc-testnet"),
  factoryAddress: address,
  heartbeatAddress: address,
  stateAddress: address,
  executorAddress: address,
  rpcUrl: z.string().regex(/^https:\/\//),
  dailySchedule: z.string().min(1),
  gatewayAddress: address,
  chainId: z.number().int(),
  proverUrl: z.string().regex(/^https?:\/\//),
  proverKey: hash32,
  privateSpendGas: z.string().regex(/^[0-9]+$/),
  sandboxClock: z.boolean(),
  gasLimit: z.string().regex(/^[0-9]+$/),
  usdcAddress: address,
  eurcAddress: address,
  swap: swapSchema,
  earn: earnSchema,
  })
  .refine((config) => !(config.chainId === 5042 && config.swap.sandboxFx), { message: "sandboxFx is for testnet only" });

export type Config = z.infer<typeof configSchema>;
export type SwapConfig = Config["swap"];
export type EarnConfig = Config["earn"];
