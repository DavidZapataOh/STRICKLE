import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { formatPlainDate } from "@strickle/core";
import { validateKind } from "./kinds/index.js";
import { RuleError, isCurrent, parseRule } from "./rule.js";
/** Reads `<root>/<COUNTRY>/<rule>.json` files; any invalid file, duplicate id or misfiled rule fails the whole load. */
export function loadRules(root) {
    const rules = new Map();
    for (const country of readdirSync(root, { withFileTypes: true }).filter((entry) => entry.isDirectory())) {
        for (const file of readdirSync(join(root, country.name)).filter((name) => name.endsWith(".json"))) {
            const label = `${country.name}/${file}`;
            let rule;
            try {
                rule = parseRule(JSON.parse(readFileSync(join(root, country.name, file), "utf8")));
                validateKind(rule);
            }
            catch (error) {
                throw new Error(`${label}: ${error instanceof RuleError ? error.problems.join("; ") : error.message}`);
            }
            if (rule.country !== country.name)
                throw new Error(`${label}: rule has country ${rule.country} but sits under ${country.name}`);
            if (rules.has(rule.id))
                throw new Error(`duplicate rule id "${rule.id}" (${label})`);
            rules.set(rule.id, rule);
        }
    }
    return [...rules.values()].sort((a, b) => a.id.localeCompare(b.id));
}
/** Fails naming every rule that is not valid on `today`, so stale rules never ship silently. */
export function assertCurrent(rules, today) {
    const stale = rules.filter((rule) => !isCurrent(rule, today));
    if (stale.length === 0)
        return;
    const lines = stale.map((rule) => `${rule.id} (${rule.country}) is valid ${formatPlainDate(rule.validFrom)} to ${formatPlainDate(rule.validTo)}`);
    throw new Error(`rules not valid on ${formatPlainDate(today)}: ${lines.join("; ")}`);
}
