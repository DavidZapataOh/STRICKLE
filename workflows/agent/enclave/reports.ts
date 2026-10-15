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

export const encodeNoticeReport = (input: { vault: Address; id: bigint; sealed: Hex }): Hex =>
  wrap(4, encodeAbiParameters([{ type: "address" }, { type: "uint64" }, { type: "bytes" }], [input.vault, input.id, input.sealed]));

export const encodePrivateSpendReport = (input: { vault: Address; proof: Hex; inputs: { root: bigint; nullifiers: [bigint, bigint]; commitments: [bigint, bigint]; publicAmount: bigint; recipient: bigint; asset: number; timestamp: bigint; associationRoot: bigint; enc: [bigint, bigint] }; poolCiphertext: Hex; next: bigint; stateCiphertext: Hex }): Hex =>
  wrap(5, encodeAbiParameters(
    [{ type: "address" }, { type: "bytes" }, { type: "tuple", components: [{ type: "uint256", name: "root" }, { type: "uint256[2]", name: "nullifiers" }, { type: "uint256[2]", name: "commitments" }, { type: "uint64", name: "publicAmount" }, { type: "uint256", name: "recipient" }, { type: "uint8", name: "asset" }, { type: "uint64", name: "timestamp" }, { type: "uint256", name: "associationRoot" }, { type: "uint256[2]", name: "enc" }] }, { type: "bytes" }, { type: "uint64" }, { type: "bytes" }],
    [input.vault, input.proof, input.inputs, input.poolCiphertext, input.next, input.stateCiphertext],
  ));
