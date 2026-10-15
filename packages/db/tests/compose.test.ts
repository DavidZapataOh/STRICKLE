import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const compose = readFileSync(new URL("../../../docker-compose.yml", import.meta.url), "utf8");

describe("docker-compose.yml", () => {
  it("publishes every port on the loopback interface only", () => {
    const ports = [...compose.matchAll(/^\s*-\s*"?([\d.:]+:\d+)"?\s*$/gm)].map((m) => m[1] ?? "");
    expect(ports.length).toBeGreaterThan(0);
    for (const port of ports) expect(port, `port mapping ${port}`).toMatch(/^127\.0\.0\.1:/);
  });
});
