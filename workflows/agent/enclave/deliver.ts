// workflows/agent/enclave/deliver.ts
import { EVMClient, type TeeRuntime, TxStatus, getNetwork, hexToBase64 } from "@chainlink/cre-sdk";
import { EVM_PB } from "@chainlink/cre-sdk/pb";
import type { Address, Hex } from "viem";
import type { Config } from "../config.ts";

// The only place that leaves the enclave: it receives a payload that is already ciphertext.
export function deliver(runtime: TeeRuntime<Config>, receiver: Address, payload: Hex, gasLimit: string = runtime.config.gasLimit): void {
  const donRuntime = runtime.usingTheDons();
  const report = donRuntime
    .report({ encodedPayload: hexToBase64(payload), encoderName: "evm", signingAlgo: "ecdsa", hashingAlgo: "keccak256" })
    .result();
  const network = getNetwork({ chainFamily: "evm", chainSelectorName: runtime.config.chainName });
  if (!network) throw new Error("unknown chain");
  const written = new EVMClient(network.chainSelector.selector)
    .writeReport(donRuntime, { receiver, report, gasConfig: { gasLimit } })
    .result();
  // The forwarder transaction can succeed while the receiver reverts the report, so both statuses are checked.
  if (written.txStatus !== TxStatus.SUCCESS) throw new Error("write failed");
  if (written.receiverContractExecutionStatus === EVM_PB.ReceiverContractExecutionStatus.REVERTED) throw new Error("write reverted");
}
