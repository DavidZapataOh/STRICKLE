import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import en from "../src/i18n/dictionaries/en.json";
import { AgentOnly } from "../src/lib/agent-only.tsx";

const html = (mode: "cre-testnet" | "none") =>
  renderToStaticMarkup(
    <AgentOnly mode={mode} capability="agentPause" t={en}>
      <button type="button">Pause</button>
    </AgentOnly>,
  );

describe("AgentOnly", () => {
  it("shows the agent's controls only where an agent exists", () => {
    expect(html("cre-testnet")).toContain("Pause");
  });

  it("says why, in one line, instead of leaving a gap or a dead control", () => {
    const out = html("none");
    expect(out).not.toContain("<button");
    expect(out).toContain(en.agent.unavailable.agentPause);
  });
});
