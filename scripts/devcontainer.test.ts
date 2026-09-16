import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const devcontainer = JSON.parse(readFileSync(".devcontainer/devcontainer.json", "utf8")) as {
  features: Record<string, { version?: string }>;
  customizations: { vscode: { extensions: string[] } };
};

describe("devcontainer", () => {
  it("pins Node to the version in .nvmrc", () => {
    const node = Object.entries(devcontainer.features).find(([name]) => name.includes("/node:"));
    expect(node?.[1].version).toBe(readFileSync(".nvmrc", "utf8").trim());
  });

  it("installs the extensions the editor recommends", () => {
    const recommended = (
      JSON.parse(readFileSync(".vscode/extensions.json", "utf8")) as { recommendations: string[] }
    ).recommendations;
    expect(devcontainer.customizations.vscode.extensions.sort()).toEqual([...recommended].sort());
  });

  it("writes no other version of its own", () => {
    const text = readFileSync(".devcontainer/devcontainer.json", "utf8").replaceAll(
      readFileSync(".nvmrc", "utf8").trim(),
      "",
    );
    expect(text).not.toMatch(/\b\d+\.\d+\.\d+\b/);
  });
});
