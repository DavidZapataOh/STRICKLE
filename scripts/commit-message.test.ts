import { describe, expect, it } from "vitest";
import { checkCommitMessage } from "./commit-message.ts";

describe("checkCommitMessage", () => {
  it("accepts a conventional commit with a scope", () => {
    expect(checkCommitMessage("feat(contract): add the certify circuit\n")).toEqual([]);
  });

  it("accepts a conventional commit without a scope", () => {
    expect(checkCommitMessage("docs: explain the verdict\n")).toEqual([]);
  });

  it("accepts a body after a blank line", () => {
    expect(
      checkCommitMessage("fix(cli): wait for the wallet\n\nThe sync had no timeout.\n"),
    ).toEqual([]);
  });

  it("ignores comment lines", () => {
    expect(checkCommitMessage("# on branch main\ntest(devnet): probe the indexer\n")).toEqual([]);
  });

  it("accepts a merge commit", () => {
    expect(checkCommitMessage("Merge branch 'main' into feature\n")).toEqual([]);
  });

  it("rejects a subject without a type", () => {
    expect(checkCommitMessage("fix stuff\n")).toEqual([
      'commit subject must be "type(scope): summary", for example "feat(contract): add the certify circuit"',
    ]);
  });

  it("rejects an unknown type", () => {
    expect(checkCommitMessage("update(cli): change the flag\n")).toEqual([
      'commit subject must be "type(scope): summary", for example "feat(contract): add the certify circuit"',
    ]);
  });

  it("rejects an empty message", () => {
    expect(checkCommitMessage("\n# nothing here\n")).toEqual(["commit message is empty"]);
  });

  it("rejects a subject that starts uppercase", () => {
    expect(checkCommitMessage("feat(cli): Add the flag\n")).toEqual([
      "commit summary must start in lowercase",
    ]);
  });

  it("rejects a subject that ends with a period", () => {
    expect(checkCommitMessage("feat(cli): add the flag.\n")).toEqual([
      "commit summary must not end with a period",
    ]);
  });

  it("rejects a subject longer than 72 characters", () => {
    const subject = `feat(cli): ${"a".repeat(70)}`;
    expect(checkCommitMessage(`${subject}\n`)).toEqual([
      `commit subject is ${subject.length} characters, the limit is 72`,
    ]);
  });

  it("reports every problem at once", () => {
    expect(checkCommitMessage("feat(cli): Add the flag.\n")).toEqual([
      "commit summary must start in lowercase",
      "commit summary must not end with a period",
    ]);
  });
});
