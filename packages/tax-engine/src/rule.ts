import { daysBetween, parsePlainDate, type PlainDate } from "@strickle/core";

export type Verification =
  | { status: "unverified" }
  | { status: "verified"; verifiedBy: string; verifiedOn: PlainDate };

export interface TaxRule {
  id: string;
  country: string;
  regime: string;
  kind: string;
  version: string;
  validFrom: PlainDate;
  validTo: PlainDate;
  source: { title: string; url: string; retrievedOn: PlainDate };
  verification: Verification;
  params: Record<string, unknown>;
}

export class RuleError extends Error {
  readonly problems: string[];
  constructor(problems: string[]) {
    super(`invalid tax rule: ${problems.join("; ")}`);
    this.name = "RuleError";
    this.problems = problems;
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

/** Validates untrusted JSON into a rule, reporting every problem at once. */
export function parseRule(input: unknown): TaxRule {
  if (!isRecord(input)) throw new RuleError(["rule: must be an object"]);
  const problems: string[] = [];

  const text = (field: string, value: unknown): string => {
    if (typeof value !== "string" || value.trim() === "") {
      problems.push(`${field}: must not be blank`);
      return "";
    }
    return value;
  };
  const date = (field: string, value: unknown): PlainDate | undefined => {
    try {
      return parsePlainDate(String(value));
    } catch {
      problems.push(`${field}: not a valid YYYY-MM-DD date`);
      return undefined;
    }
  };

  const id = text("id", input.id);
  const regime = text("regime", input.regime);
  const kind = text("kind", input.kind);
  const version = text("version", input.version);

  const country = typeof input.country === "string" && /^[A-Z]{2}$/.test(input.country) ? input.country : "";
  if (!country) problems.push("country: must be an ISO 3166-1 alpha-2 code in capitals");

  const validFrom = date("validFrom", input.validFrom);
  const validTo = date("validTo", input.validTo);
  if (validFrom && validTo && daysBetween(validFrom, validTo) < 0) problems.push("validTo: must not be before validFrom");

  let source: TaxRule["source"] | undefined;
  if (!isRecord(input.source)) {
    problems.push("source: required");
  } else {
    const title = text("source.title", input.source.title);
    const url = typeof input.source.url === "string" && URL.canParse(input.source.url) && new URL(input.source.url).protocol === "https:" ? input.source.url : "";
    if (!url) problems.push("source.url: must be an https URL");
    const retrievedOn = date("source.retrievedOn", input.source.retrievedOn);
    if (retrievedOn && validTo && daysBetween(retrievedOn, validTo) < 0) problems.push("source.retrievedOn: must not be after validTo");
    if (retrievedOn) source = { title, url, retrievedOn };
  }

  let verification: Verification | undefined;
  const hasVerifier = input.verifiedBy !== undefined || input.verifiedOn !== undefined;
  if (input.verification === "unverified") {
    if (hasVerifier) {
      if (input.verifiedBy !== undefined) problems.push("verifiedBy: only allowed on a verified rule");
      if (input.verifiedOn !== undefined) problems.push("verifiedOn: only allowed on a verified rule");
    }
    verification = { status: "unverified" };
  } else if (input.verification === "verified") {
    const verifiedBy = typeof input.verifiedBy === "string" && input.verifiedBy.trim() !== "" ? input.verifiedBy : undefined;
    if (!verifiedBy) problems.push("verifiedBy: required for a verified rule");
    const verifiedOn = input.verifiedOn === undefined ? undefined : date("verifiedOn", input.verifiedOn);
    if (input.verifiedOn === undefined) problems.push("verifiedOn: required for a verified rule");
    if (verifiedBy && verifiedOn) verification = { status: "verified", verifiedBy, verifiedOn };
  } else {
    problems.push('verification: must be "unverified" or "verified"');
  }

  if (!isRecord(input.params)) problems.push("params: must be an object");

  if (problems.length > 0 || !validFrom || !validTo || !source || !verification) throw new RuleError(problems);
  return { id, country, regime, kind, version, validFrom, validTo, source, verification, params: input.params as Record<string, unknown> };
}

export function isCurrent(rule: TaxRule, today: PlainDate): boolean {
  return daysBetween(rule.validFrom, today) >= 0 && daysBetween(today, rule.validTo) >= 0;
}
