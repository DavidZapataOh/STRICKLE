import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { basename, extname } from "node:path";
import { test } from "node:test";

const root = new URL("..", import.meta.url).pathname;
const tracked = execFileSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8" })
  .split("\0")
  .filter(Boolean);

const TEXT = new Set([".ts", ".tsx", ".js", ".mjs", ".mts", ".json", ".md", ".sol", ".toml", ".yml", ".yaml", ".css", ".html", ".sql", ".nr", ".txt", ".sh"]);
const SELF = "scripts/repo-hygiene.test.mjs";
const textFiles = tracked.filter(
  (file) =>
    (TEXT.has(extname(file)) || basename(file) === ".env.example") && file !== SELF && file !== "package-lock.json",
);

const matches = (pattern) =>
  textFiles.flatMap((file) =>
    readFileSync(root + file, "utf8")
      .split("\n")
      .flatMap((line, i) => (pattern.test(line) ? [`${file}:${i + 1}: ${line.trim().slice(0, 80)}`] : [])),
  );

test("no environment file is tracked except the example", () => {
  const envFiles = tracked.filter((f) => basename(f).startsWith(".env") && basename(f) !== ".env.example");
  assert.deepEqual(envFiles, []);
});

test("no tracked file mentions the private process or its folders", () => {
  assert.deepEqual(matches(/\bsprints?\b|PROYECTO_CAJITAS|\.impeccable|research_notes|\bS\d{2}\/\d{2}\b/i), []);
});

test("no tracked file contains a secret value", () => {
  const secret =
    /(?:PRIVATE_KEY|ENTITY_SECRET|API_KEY|SECRET|PASSWORD)\w*\s*[=:]\s*["']?[A-Za-z0-9+/_.:-]{16,}|(?:TEST|LIVE)_API_KEY:[0-9a-f-]{8,}:/;
  assert.deepEqual(matches(secret), []);
});

test("no Circle recovery file is tracked", () => {
  assert.deepEqual(
    tracked.filter((f) => /(^|\/)recovery(\/|$)|recovery_file/i.test(f)),
    [],
  );
});
