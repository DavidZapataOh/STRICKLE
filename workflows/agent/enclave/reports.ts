// workflows/agent/enclave/reports.ts
import { type Address, type Hex, encodeAbiParameters } from "viem";

const PAY_SALARY = 2;
const TICK = 3;
const wrap = (action: number, args: Hex): Hex => encodeAbiParameters([{ type: "uint8" }, { type: "bytes" }], [action, args]);

export const encodeSalaryReport = (input: { vault: Address; asset: number; payee: Address; amount: bigint; seen: bigint; next: bigint; ciphertext: Hex }): Hex =>
  wrap(
    PAY_SALARY,
    encodeAbiParameters(
      [{ type: "address" }, { type: "uint8" }, { type: "address" }, { type: "uint256" }, { type: "uint256" }, { type: "uint64" }, { type: "bytes" }],
      [input.vault, input.asset, input.payee, input.amount, input.seen, input.next, input.ciphertext],
    ),
  );

export const encodeTickReport = (input: { vault: Address; next: bigint; ciphertext: Hex }): Hex =>
  wrap(TICK, encodeAbiParameters([{ type: "address" }, { type: "uint64" }, { type: "bytes" }], [input.vault, input.next, input.ciphertext]));
