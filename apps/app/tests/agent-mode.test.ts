import { describe, expect, it } from "vitest";
import { agentMode, capabilities } from "../src/lib/agent-mode.ts";

describe("agentMode", () => {
  it("is the confidential workflow on testnet and nothing on mainnet, where CRE does not run", () => {
    expect(agentMode("testnet")).toBe("cre-testnet");
    expect(agentMode("mainnet")).toBe("none");
  });
});

describe("capabilities", () => {
  it("claims automation, confidentiality, an agent to pause and the app's own screens only where an agent exists", () => {
    expect(capabilities("cre-testnet")).toEqual({ app: true, autoSplit: true, autoSalary: true, enclaveProposals: true, confidential: true, agentPause: true, agentSettings: true });
    expect(Object.values(capabilities("none")).every((value) => value === false)).toBe(true);
  });
});
