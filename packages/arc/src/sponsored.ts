import type { Abi, AbiParameter, Address, Hex, PublicClient } from "viem";
import type { ArcNetwork } from "./networks.ts";
import type { walletsClient } from "./circle.ts";

type CircleClient = ReturnType<typeof walletsClient>;

const typeOf = (parameter: AbiParameter): string => {
  if (!parameter.type.startsWith("tuple")) return parameter.type;
  const components = (parameter as AbiParameter & { components: readonly AbiParameter[] }).components.map(typeOf).join(",");
  return `(${components})${parameter.type.slice("tuple".length)}`;
};

const valueOf = (parameter: AbiParameter, value: unknown): unknown => {
  if (parameter.type.endsWith("]")) {
    const element = { ...parameter, type: parameter.type.slice(0, parameter.type.lastIndexOf("[")) } as AbiParameter;
    return (value as unknown[]).map((item) => valueOf(element, item));
  }
  if (parameter.type === "tuple") {
    const components = (parameter as AbiParameter & { components: readonly (AbiParameter & { name: string })[] }).components;
    const record = value as Record<string, unknown>;
    return components.map((component) => valueOf(component, record[component.name]));
  }
  return typeof value === "bigint" || typeof value === "number" ? value.toString() : value;
};

/** The two things Circle's contract-execution call needs: the canonical signature and string-typed parameters. */
export function abiCall(abi: Abi, functionName: string, args: readonly unknown[]): { abiFunctionSignature: string; abiParameters: unknown[] } {
  const item = abi.find((entry) => entry.type === "function" && entry.name === functionName);
  if (!item || item.type !== "function") throw new Error(`function ${functionName} is not in the ABI`);
  if (item.inputs.length !== args.length) throw new Error(`${functionName} takes ${item.inputs.length} arguments, got ${args.length}`);
  return {
    abiFunctionSignature: `${functionName}(${item.inputs.map(typeOf).join(",")})`,
    abiParameters: item.inputs.map((input, i) => valueOf(input, args[i])),
  };
}

export interface SponsoredReceipt {
  txHash: Hex;
  gasUsed: bigint;
  /** What the Gas Station paid, in native base units (18 decimals): gas used times the effective gas price. */
  feePaid: bigint;
}

const FAILED = ["FAILED", "CANCELLED", "DENIED"];

/** Runs a contract call from a Circle smart account; Gas Station pays, the account's native balance does not move for gas. */
export async function executeSponsored(args: {
  circle: CircleClient;
  publicClient: PublicClient;
  network: ArcNetwork;
  walletId: string;
  contract: Address;
  abi: Abi;
  functionName: string;
  args: readonly unknown[];
  timeoutMs?: number;
}): Promise<SponsoredReceipt> {
  const { abiFunctionSignature, abiParameters } = abiCall(args.abi, args.functionName, args.args);
  const created = await args.circle.createContractExecutionTransaction({
    walletId: args.walletId,
    contractAddress: args.contract,
    abiFunctionSignature,
    abiParameters: abiParameters as never,
    fee: { type: "level", config: { feeLevel: "MEDIUM" } },
  });
  const id = created.data?.id;
  if (!id) throw new Error("Circle returned no transaction id");

  const deadline = Date.now() + (args.timeoutMs ?? 180_000);
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 2_500));
    const tx = (await args.circle.getTransaction({ id })).data?.transaction;
    if (tx?.state === "COMPLETE" && tx.txHash) {
      const receipt = await args.publicClient.getTransactionReceipt({ hash: tx.txHash as Hex });
      if (receipt.status !== "success") throw new Error(`${args.functionName} reverted on chain: ${tx.txHash}`);
      return { txHash: receipt.transactionHash, gasUsed: receipt.gasUsed, feePaid: receipt.gasUsed * receipt.effectiveGasPrice };
    }
    if (tx && FAILED.includes(tx.state)) throw new Error(`${args.functionName} ended in state ${tx.state}`);
  }
  throw new Error(`${args.functionName} did not complete in time`);
}
