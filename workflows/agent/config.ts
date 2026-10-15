// workflows/agent/config.ts
import { z } from "zod";

const address = z.string().regex(/^0x[0-9a-fA-F]{40}$/);

export const configSchema = z.object({
  schedule: z.string().min(1),
  chainName: z.literal("arc-testnet"),
  factoryAddress: address,
  heartbeatAddress: address,
  rpcUrl: z.string().regex(/^https:\/\//),
  gasLimit: z.string().regex(/^[0-9]+$/),
});

export type Config = z.infer<typeof configSchema>;
