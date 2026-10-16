import { parseAbi } from "viem";

export const factoryAbi = parseAbi(["function create(address owner) returns (address)", "function vaultOf(address owner) view returns (address)", "function predict(address owner) view returns (address)"]);
export const vaultAbi = parseAbi(["function approveRecipient(uint8 box, address who)", "function setAgent(address agent, uint128 cap, uint32 window)", "function agent() view returns (address)", "function approvedFrom(uint8 box, address who) view returns (uint64)"]);
export const executorAbi = parseAbi(["function register(address vault)", "function registered(address vault) view returns (bool)"]);
export const agentStateAbi = parseAbi(["function submitProfile(address vault, bytes sealedData)", "function enclaveKey() view returns (bytes32)", "function head(address vault) view returns (uint64 version, uint64 updatedAt, uint64 applied)"]);
