import { RuleError } from "../rule.js";
import { ELIGIBILITY_KIND, parseEligibilityParams } from "./eligibility.js";
import { FALLBACK_KIND, parseFallbackParams } from "./fallback.js";
import { FLAT_RATE_KIND, parseFlatRateParams } from "./flat-rate.js";
import { MEI_KIND, parseMeiParams } from "./mei.js";
import { SAFE_HARBOR_KIND, parseSafeHarborParams } from "./safe-harbor.js";
import { MONOTRIBUTO_KIND, parseMonotributoParams } from "./monotributo.js";
import { SIMPLE_KIND, parseSimpleParams } from "./simple.js";
import { RESICO_KIND, parseResicoParams } from "./resico.js";
const PARSERS = {
    [RESICO_KIND]: parseResicoParams,
    [MONOTRIBUTO_KIND]: parseMonotributoParams,
    [SIMPLE_KIND]: parseSimpleParams,
    [ELIGIBILITY_KIND]: parseEligibilityParams,
    [MEI_KIND]: parseMeiParams,
    [SAFE_HARBOR_KIND]: parseSafeHarborParams,
    [FLAT_RATE_KIND]: parseFlatRateParams,
    [FALLBACK_KIND]: parseFallbackParams,
};
/** Fails if the rule's kind is unknown or its params do not parse for that kind. */
export function validateKind(rule) {
    const parse = PARSERS[rule.kind];
    if (!parse)
        throw new RuleError([`kind: unknown kind "${rule.kind}"`]);
    parse(rule.params);
}
