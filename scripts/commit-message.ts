const TYPES = ["build", "chore", "ci", "docs", "feat", "fix", "perf", "refactor", "style", "test"];
const SUBJECT = new RegExp(`^(${TYPES.join("|")})(\\([a-z0-9-]+\\))?: (.+)$`);
const LIMIT = 72;

export function checkCommitMessage(message: string): string[] {
  const lines = message.split("\n").filter((line) => !line.startsWith("#"));
  const subject = lines.find((line) => line.trim() !== "")?.trim();

  if (subject === undefined) return ["commit message is empty"];
  if (subject.startsWith("Merge ")) return [];

  const match = SUBJECT.exec(subject);
  if (!match) {
    return [
      'commit subject must be "type(scope): summary", for example "feat(contract): add the certify circuit"',
    ];
  }

  const summary = match[3];
  const errors: string[] = [];
  if (summary[0] !== summary[0].toLowerCase())
    errors.push("commit summary must start in lowercase");
  if (summary.endsWith(".")) errors.push("commit summary must not end with a period");
  if (subject.length > LIMIT) {
    errors.push(`commit subject is ${subject.length} characters, the limit is ${LIMIT}`);
  }
  return errors;
}
