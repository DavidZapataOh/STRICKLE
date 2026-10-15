import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { networks } from "@strickle/arc/networks";

const solc = readFileSync(new URL("../foundry.toml", import.meta.url), "utf8").match(/^solc_version = "(.+)"$/m)?.[1];

test("the pinned solc version is one the Arc explorers can verify", async (t) => {
  assert.ok(solc, "foundry.toml pins solc_version");
  let checked = 0;
  for (const network of Object.values(networks)) {
    const response = await fetch(`${network.explorerUrl}/api/v2/smart-contracts/verification/config`);
    // Rate limits (429) and bot challenges (403) mean "could not check", not "unsupported".
    if (!response.ok || !response.headers.get("content-type")?.includes("json")) {
      t.diagnostic(`${network.name} explorer not checkable (HTTP ${response.status})`);
      continue;
    }
    const { solidity_compiler_versions: versions } = await response.json();
    assert.ok(
      versions.some((version) => version.startsWith(`v${solc}+commit.`)),
      `${network.name} explorer has no solc ${solc}; pin a version it supports`,
    );
    checked++;
  }
  if (checked === 0) t.skip("no explorer could be checked");
});
