import { RuleError, type TaxRule } from "../rule.ts";
import { FALLBACK_KIND, parseFallbackParams } from "./fallback.ts";
import { FLAT_RATE_KIND, parseFlatRateParams } from "./flat-rate.ts";
import { MEI_KIND, parseMeiParams } from "./mei.ts";
import { SAFE_HARBOR_KIND, parseSafeHarborParams } from "./safe-harbor.ts";
import { MONOTRIBUTO_KIND, parseMonotributoParams } from "./monotributo.ts";
import { SIMPLE_KIND, parseSimpleParams } from "./simple.ts";
import { RESICO_KIND, parseResicoParams } from "./resico.ts";

const PARSERS: Record<string, (params: Record<string, unknown>) => unknown> = {
  [RESICO_KIND]: parseResicoParams,
  [MONOTRIBUTO_KIND]: parseMonotributoParams,
  [SIMPLE_KIND]: parseSimpleParams,
  [MEI_KIND]: parseMeiParams,
  [SAFE_HARBOR_KIND]: parseSafeHarborParams,
  [FLAT_RATE_KIND]: parseFlatRateParams,
  [FALLBACK_KIND]: parseFallbackParams,
};

/** Fails if the rule's kind is unknown or its params do not parse for that kind. */
export function validateKind(rule: TaxRule): void {
  const parse = PARSERS[rule.kind];
  if (!parse) throw new RuleError([`kind: unknown kind "${rule.kind}"`]);
  parse(rule.params);
}
