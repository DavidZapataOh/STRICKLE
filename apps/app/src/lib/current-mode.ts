import { appNetwork } from "../config/network.ts";
import { type AgentMode, agentMode } from "./agent-mode.ts";

export const currentAgentMode = (): AgentMode => agentMode(appNetwork());
