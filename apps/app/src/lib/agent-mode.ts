export type AgentMode = "cre-testnet" | "none";

/** The agent runs in a confidential Chainlink CRE workflow, which lists Arc testnet only: on mainnet there is no agent. */
export function agentMode(network: "testnet" | "mainnet"): AgentMode {
  return network === "testnet" ? "cre-testnet" : "none";
}

export interface Capabilities {
  /** The app's own screens (onboarding, Home, Activity, Boxes, Settings) need the agent; without one they are not served. */
  app: boolean;
  autoSplit: boolean;
  autoSalary: boolean;
  enclaveProposals: boolean;
  confidential: boolean;
  agentPause: boolean;
  agentSettings: boolean;
}

export function capabilities(mode: AgentMode): Capabilities {
  const on = mode === "cre-testnet";
  return { app: on, autoSplit: on, autoSalary: on, enclaveProposals: on, confidential: on, agentPause: on, agentSettings: on };
}
