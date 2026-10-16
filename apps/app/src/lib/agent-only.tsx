import type { ReactNode } from "react";
import type { Dictionary } from "@/i18n/dictionaries";
import { type AgentMode, type Capabilities, capabilities } from "./agent-mode.ts";
import { currentAgentMode } from "./current-mode.ts";

type Gated = "agentPause" | "agentSettings" | "enclaveProposals" | "plan";
const CAPABILITY: Record<Gated, keyof Capabilities> = { agentPause: "agentPause", agentSettings: "agentSettings", enclaveProposals: "enclaveProposals", plan: "autoSalary" };

/** Mounts an agent-dependent part only where an agent exists; elsewhere one honest line says why. */
export function AgentOnly({ capability, t, children, mode = currentAgentMode() }: { capability: Gated; t: { agent: Dictionary["agent"] }; children: ReactNode; mode?: AgentMode }) {
  if (capabilities(mode)[CAPABILITY[capability]]) return <>{children}</>;
  return <p className="agent-note">{t.agent.unavailable[capability]}</p>;
}
