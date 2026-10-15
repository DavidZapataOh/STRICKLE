// workflows/agent/workflow.ts
import {
  CronCapability,
  EVMClient,
  LAST_FINALIZED_BLOCK_NUMBER,
  Runner,
  TxStatus,
  type Runtime,
  bytesToHex,
  encodeCallMsg,
  getNetwork,
  handler,
  handlerInTee,
  hexToBase64,
} from "@chainlink/cre-sdk";
import { EVM_PB } from "@chainlink/cre-sdk/pb";
import { decodeFunctionResult, encodeFunctionData, getAddress, keccak256, toBytes, zeroAddress } from "viem";
import { type Config, configSchema } from "./config.ts";
import { onProfileSubmitted } from "./enclave/profile-handler.ts";
import { encodeTick, factoryAbi } from "./tick.ts";

const onCron = (runtime: Runtime<Config>): string => {
  const { chainName, factoryAddress, heartbeatAddress, gasLimit } = runtime.config;
  const network = getNetwork({ chainFamily: "evm", chainSelectorName: chainName });
  if (!network) throw new Error(`unknown chain: ${chainName}`);
  const evm = new EVMClient(network.chainSelector.selector);

  const read = evm
    .callContract(runtime, {
      call: encodeCallMsg({
        from: zeroAddress,
        to: factoryAddress as `0x${string}`,
        data: encodeFunctionData({ abi: factoryAbi, functionName: "implementation" }),
      }),
      blockNumber: LAST_FINALIZED_BLOCK_NUMBER,
    })
    .result();
  const seen = getAddress(
    decodeFunctionResult({ abi: factoryAbi, functionName: "implementation", data: bytesToHex(read.data) }),
  );

  const tickedAt = BigInt(Math.floor(runtime.now().getTime() / 1000));
  const report = runtime
    .report({
      encodedPayload: hexToBase64(encodeTick(tickedAt, seen)),
      encoderName: "evm",
      signingAlgo: "ecdsa",
      hashingAlgo: "keccak256",
    })
    .result();

  const written = evm.writeReport(runtime, { receiver: heartbeatAddress, report, gasConfig: { gasLimit } }).result();
  if (written.txStatus !== TxStatus.SUCCESS) throw new Error(`heartbeat write failed with status ${written.txStatus}`);
  if (written.receiverContractExecutionStatus === EVM_PB.ReceiverContractExecutionStatus.REVERTED) throw new Error("the heartbeat receiver reverted the report");
  return bytesToHex(written.txHash ?? new Uint8Array(32));
};

export const HANDLER_NAMES = ["heartbeat", "profile"] as const;

export const initWorkflow = (config: Config) => {
  const cron = new CronCapability();
  const network = getNetwork({ chainFamily: "evm", chainSelectorName: config.chainName });
  if (!network) throw new Error(`unknown chain: ${config.chainName}`);
  const evm = new EVMClient(network.chainSelector.selector);
  return [
    handler(cron.trigger({ schedule: config.schedule }), onCron),
    handlerInTee(
      evm.logTrigger({
        addresses: [hexToBase64(config.stateAddress)],
        topics: [{ values: [hexToBase64(keccak256(toBytes("ProfileSubmitted(address,uint64,bytes)")))] }],
      }),
      onProfileSubmitted,
      {},
    ),
  ];
};

export async function main() {
  const runner = await Runner.newRunner<Config>({ configSchema });
  await runner.run(initWorkflow);
}
