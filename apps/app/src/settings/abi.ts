import { parseAbi } from "viem";

export const settingsReadAbi = parseAbi([
  "function agent() view returns (address)",
  "function agentPaused() view returns (bool)",
  "function agentCap() view returns (uint128)",
  "function agentWindow() view returns (uint32)",
  "function ruleChanges(uint8 box) view returns ((uint32 delay, bool alwaysDelayed, bool restricted, uint128 floor, uint64 lockedUntil) rule, uint64 effectiveAt, bool open)",
  "function approvedFrom(uint8 box, address who) view returns (uint64)",
]);

export const settingsWriteAbi = parseAbi([
  "function pauseAgent()",
  "function resumeAgent()",
  "function setAgent(address agent, uint128 cap, uint32 window)",
  "function setRule(uint8 box, (uint32 delay, bool alwaysDelayed, bool restricted, uint128 floor, uint64 lockedUntil) rule)",
  "function applyRuleChange(uint8 box)",
  "function cancelRuleChange(uint8 box)",
  "function approveRecipient(uint8 box, address who)",
  "function revokeRecipient(uint8 box, address who)",
]);
