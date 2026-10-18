# @strickle/proof-of-income

Checks that an email really came from the domain it claims, which is the first step of proving income from a payment notice.

## What it does

- Verifies the first DKIM signature of an email as RFC 6376 describes: the body hash, the signed headers (the sender must be one of them), the RSA-SHA256 signature against the key published in DNS, and that the signing domain is the sender's domain or a parent of it.
- Returns who signed (domain and selector), the sender and the signing time, or the reason it failed: `no-signature`, `unsupported`, `no-key`, `body-hash`, `signature`, `from-not-signed` or `misaligned`.
- Looks keys up through a resolver you pass in; `dohResolver` reads them over DNS-over-HTTPS, which is what an environment with HTTP and no DNS needs.
- Depends only on a SHA-256 implementation, so it runs in a browser, in Node and inside a confidential enclave.

## Install

```sh
npm install ./strickle-proof-of-income-0.1.0.tgz
```

The tarball comes from `npm run kits:pack -- @strickle/proof-of-income` in the repository. Node 24 or newer.

## Example

The file `examples/proof-of-income.mjs` is this code:

```js
import { readFileSync } from "node:fs";
import { verifyDkim } from "@strickle/proof-of-income";

const email = readFileSync(new URL("./signed.eml", import.meta.url), "utf8");
const record = JSON.parse(readFileSync(new URL("./key.json", import.meta.url), "utf8"));
const result = await verifyDkim(email, async (name) => (name === record.name ? record.txt : null));
const altered = await verifyDkim(email.replace("How are you?", "How much?"), async (name) => (name === record.name ? record.txt : null));
console.log(`signed by ${result.ok ? result.domain : result.reason}, altered body: ${altered.ok ? "accepted" : altered.reason}`);
if (!result.ok || altered.ok) throw new Error("unexpected result");
console.log("ok");
```

## What it does not do

- It does not read what the email says. Recognising a payment notice, its platform and its amount is a separate step that needs a rule per platform.
- It does not hide anything: the whole email is an input. A zero-knowledge proof of the signature is not part of this package.
- A DKIM signature proves the sending domain signed the message, not that the message is true or that the sender is a person.

## Tested on

`tests/` verifies real emails signed by icloud.com and the variants a forger would try: a changed body, a changed sender, a missing selector and a missing signature.
