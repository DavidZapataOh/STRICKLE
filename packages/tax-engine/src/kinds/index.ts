import { RuleError, type TaxRule } from "../rule.ts";
import { MONOTRIBUTO_KIND, parseMonotributoParams } from "./monotributo.ts";
import { RESICO_KIND, parseResicoParams } from "./resico.ts";

const PARSERS: Record<string, (params: Record<string, unknown>) => unknown> = {
  [RESICO_KIND]: parseResicoParams,
  [MONOTRIBUTO_KIND]: parseMonotributoParams,
};

/** Fails if the rule's kind is unknown or its params do not parse for that kind. */
export function validateKind(rule: TaxRule): void {
  const parse = PARSERS[rule.kind];
  if (!parse) throw new RuleError([`kind: unknown kind "${rule.kind}"`]);
  parse(rule.params);
}
