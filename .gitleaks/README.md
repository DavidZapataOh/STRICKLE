# .gitleaks/gitleaks.toml

A pinned, verbatim copy of gitleaks' own default ruleset
(`config/gitleaks.toml` at tag
[`v8.30.1`](https://github.com/gitleaks/gitleaks/blob/v8.30.1/config/gitleaks.toml),
matching the `gitleaks` version installed by CI and by developers), with one
line removed from the global `[allowlist]` `paths` array: the entry that
excludes `deno.lock`, `npm-shrinkwrap.json`, `package-lock.json`,
`pnpm-lock.yaml` and `yarn.lock` from every scan.

Every rule is otherwise unchanged. The root `../.gitleaks.toml` extends this
file with `[extend] path = ...` and adds Strickle's own rules for
`MIDNIGHT_WALLET_SEED` and `MIDNIGHT_WALLET_MNEMONIC`.

## Why not `[extend] useDefault = true`?

That is the normal way to extend gitleaks' default ruleset, and it is what
the root config would use if the goal were only to add rules. gitleaks path
allowlists are **appended**, never subtracted, when one config extends
another — the manual says so explicitly ("Allowlist arrays are appended and
can contain duplicates"), and it was confirmed empirically here: extending
with `useDefault = true` plus a new `[[allowlists]]` (or an overriding
`[allowlist]`) still left `package-lock.json` invisible to every rule,
because the inherited default's path entry was still present. There is no
config option to remove or override a single entry inherited this way.
Vendoring a copy of the default ruleset — with that one line edited out — is
the only way to keep every default detection rule while re-scanning
lockfiles.

## Run it from the repository root

`[extend] path` is resolved against the working directory, not against the
config file. `gitleaks ... -c .gitleaks.toml` from the root works; the same
command from a subdirectory fails with `failed to load extended config`. The
pre-commit hook and the `scan` workflow both run from the root.

## Updating

When the pinned `gitleaks` version changes, re-fetch
`https://raw.githubusercontent.com/gitleaks/gitleaks/v<version>/config/gitleaks.toml`,
diff it against this file, remove the lockfile line from the new copy's
global allowlist again, and update the version in this file's header comment
and in `.gitleaks.toml`.
