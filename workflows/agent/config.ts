// workflows/agent/config.ts
import { z } from "zod";

const address = z.string().regex(/^0x[0-9a-fA-F]{40}$/);
const hash32 = z.string().regex(/^0x[0-9a-fA-F]{64}$/);

export const configSchema = z.object({
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
});

export type Config = z.infer<typeof configSchema>;
