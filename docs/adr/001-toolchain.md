---
status: accepted
date: 2026-09-15
---

# 001. Pin the Midnight toolchain to exact versions

## Context and problem statement

Midnight's components move together: a compiler, a runtime package, a set of SDK packages, and three Docker images that have to agree with the network they talk to. The support matrix is the only place where that agreement is written down.

Drift is silent. The GitHub action that installs the compiler runs `compact update <version> || true`, so a failed pin leaves the previous compiler in place and the build carries on. The generated contract calls `checkRuntimeVersion('0.16.0')` at load time, so a runtime mismatch surfaces as a runtime error, far from its cause. The current compiler release, 0.34.0, targets a newer ledger and rejects our `pragma language_version 0.23;` outright. npm already serves TypeScript 7 as `latest`, which our lint toolchain does not accept.

## Considered options

- Ranges (`^`) and `latest`, the npm default.
- Exact versions, written by hand in each file.
- Exact versions plus a check that fails the build when any of them drifts.

## Decision

Exact versions everywhere, enforced by one check.

Versions live in the files the ecosystem already reads: `.compact-version` (0.31.1), `.nvmrc` (24.14.0), each `package.json`, and the devnet compose file. Only what has no home of its own goes into `toolchain.json`: the SDK (`4.1.1`) and wallet (`1.2.0`) versions, the three image tags (proof server `8.1.0`, node `1.0.2`, indexer `4.3.3-hotfix`), and the genesis hash of the local chain. The language and runtime versions are never written down: they are read from the installed compiler and compared with what the packages declare.

`npm run check:toolchain` is the single enforcement point. It is a pure function with negative tests on every message, wrapped in a thin command, and it runs before a push, in CI right after the compiler is installed, and in the submission preflight.

### Consequences

- Good: a compiler swapped underneath the build is caught by the next check instead of by a confusing runtime error.
- Good: the same command answers "is this machine set up correctly?" for a laptop, a container and a CI runner.
- Bad: every upgrade is a deliberate change with its own verification. Automated dependency updates have to be grouped and run through the local network before they can be trusted.
- Known and accepted: `onchain-runtime-v3` resolves twice, 3.0.0 and 3.1.1, because the SDK pins one and the runtime asks for the other. Forcing a single copy with an override breaks deployment, so the duplicate is documented rather than fixed.

### Confirmation

`npm run check:toolchain` prints `toolchain ok`. Its test suite fails if any message changes.

## Rejected, and why

- **pnpm with Turborepo.** npm workspaces is what the official generator and every example DApp use; pnpm and Turborepo appear only in Midnight's library repositories. Task orchestration is a separate question, to be decided with a measurement.
- **Starting from the bulletin-board example.** It ships devnet images several versions behind, ESLint and Prettier, and a contract that is not ours.
- **Compiler 0.34.0.** It targets a ledger the live network does not run; its own release notes say to stay on 0.31.x.
- **Patching the wallet SDK.** The iterator bug it is famous for is a gap in older JavaScript engines, not in the SDK: on the pinned Node it does not reproduce, and the end-to-end deployment passes unpatched. Refusing the wrong Node is the real protection.
- **A named Docker volume for the proof server's parameters.** `down -v` would wipe it. A directory on the host survives, and is shared with the compiler's own cache.
- **A dependency override to de-duplicate the on-chain runtime.** It broke deployment with a missing module.
