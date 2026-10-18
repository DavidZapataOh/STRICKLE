import { sha256 } from "@noble/hashes/sha2.js";

export type DkimFailure = "no-signature" | "unsupported" | "no-key" | "body-hash" | "signature" | "from-not-signed" | "misaligned";
export type DkimResult = { ok: true; domain: string; selector: string; from: string; signedAt: number | null } | { ok: false; reason: DkimFailure };

/** Looks up the TXT record of a DKIM selector, e.g. `s1._domainkey.example.com`; null when there is none. */
export type KeyResolver = (name: string) => Promise<string | null>;

const fail = (reason: DkimFailure): DkimResult => ({ ok: false, reason });
const text = new TextEncoder();
const fromBase64 = (value: string): Uint8Array => Uint8Array.from(atob(value.replace(/\s+/g, "")), (char) => char.charCodeAt(0));
const toBase64 = (bytes: Uint8Array): string => btoa(String.fromCharCode(...bytes));
const SHA256_PREFIX = Uint8Array.from([0x30, 0x31, 0x30, 0x0d, 0x06, 0x09, 0x60, 0x86, 0x48, 0x01, 0x65, 0x03, 0x04, 0x02, 0x01, 0x05, 0x00, 0x04, 0x20]);

interface Header {
  name: string;
  raw: string;
}

function split(raw: string): { headers: Header[]; body: string } | null {
  const normalized = raw.replace(/\r?\n/g, "\r\n");
  const cut = normalized.indexOf("\r\n\r\n");
  if (cut < 0) return null;
  const headers: Header[] = [];
  for (const line of normalized.slice(0, cut).split("\r\n")) {
    if (/^[ \t]/.test(line) && headers.length > 0) (headers[headers.length - 1] as Header).raw += `\r\n${line}`;
    else if (line.includes(":")) headers.push({ name: line.slice(0, line.indexOf(":")).trim().toLowerCase(), raw: line });
  }
  return { headers, body: normalized.slice(cut + 4) };
}

const relaxedValue = (raw: string): string => raw.slice(raw.indexOf(":") + 1).replace(/\r\n/g, "").replace(/[ \t]+/g, " ").trim();
const canonicalHeader = (header: Header, relaxed: boolean): string => (relaxed ? `${header.name}:${relaxedValue(header.raw)}\r\n` : `${header.raw}\r\n`);

function canonicalBody(body: string, relaxed: boolean): string {
  const lines = body.split("\r\n").map((line) => (relaxed ? line.replace(/[ \t]+$/, "").replace(/[ \t]+/g, " ") : line));
  while (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  return lines.length === 0 ? (relaxed ? "" : "\r\n") : `${lines.join("\r\n")}\r\n`;
}

function tagsOf(value: string): Map<string, string> {
  const tags = new Map<string, string>();
  for (const part of value.split(";")) {
    const at = part.indexOf("=");
    if (at > 0) tags.set(part.slice(0, at).trim(), part.slice(at + 1).replace(/\s+/g, ""));
  }
  return tags;
}

const bytesToBig = (bytes: Uint8Array): bigint => bytes.reduce((acc, byte) => (acc << 8n) | BigInt(byte), 0n);

function modPow(base: bigint, exponent: bigint, modulus: bigint): bigint {
  let result = 1n;
  let b = base % modulus;
  for (let e = exponent; e > 0n; e >>= 1n) {
    if (e & 1n) result = (result * b) % modulus;
    b = (b * b) % modulus;
  }
  return result;
}

/** Reads the modulus and exponent out of a DER SubjectPublicKeyInfo holding an RSA key. */
function rsaKey(spki: Uint8Array): { n: bigint; e: bigint } | null {
  let cursor = 0;
  const step = (tag: number, source: Uint8Array): { value: Uint8Array; next: number } | null => {
    if (source[cursor] !== tag) return null;
    let length = source[cursor + 1] as number;
    let header = 2;
    if (length & 0x80) {
      const count = length & 0x7f;
      length = 0;
      for (let index = 0; index < count; index++) length = (length << 8) | (source[cursor + 2 + index] as number);
      header += count;
    }
    return { value: source.subarray(cursor + header, cursor + header + length), next: cursor + header + length };
  };
  const outer = step(0x30, spki);
  if (!outer) return null;
  const inner = outer.value;
  cursor = 0;
  const algorithm = step(0x30, inner);
  if (!algorithm) return null;
  cursor = algorithm.next;
  const bits = step(0x03, inner);
  if (!bits || bits.value[0] !== 0) return null;
  const sequence = bits.value.subarray(1);
  cursor = 0;
  const pair = step(0x30, sequence);
  if (!pair) return null;
  const body = pair.value;
  cursor = 0;
  const modulus = step(0x02, body);
  if (!modulus) return null;
  cursor = modulus.next;
  const exponent = step(0x02, body);
  if (!exponent) return null;
  return { n: bytesToBig(modulus.value), e: bytesToBig(exponent.value) };
}

function verifyRsaSha256(key: { n: bigint; e: bigint }, signature: Uint8Array, digest: Uint8Array): boolean {
  const size = Math.ceil(key.n.toString(16).length / 2);
  if (signature.length !== size || size < SHA256_PREFIX.length + digest.length + 11) return false;
  const s = bytesToBig(signature);
  if (s >= key.n) return false;
  const em = modPow(s, key.e, key.n).toString(16).padStart(size * 2, "0");
  const expected = new Uint8Array(size);
  expected.fill(0xff);
  expected[0] = 0x00;
  expected[1] = 0x01;
  expected[size - SHA256_PREFIX.length - digest.length - 1] = 0x00;
  expected.set(SHA256_PREFIX, size - SHA256_PREFIX.length - digest.length);
  expected.set(digest, size - digest.length);
  return em === Array.from(expected, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * Verifies the first DKIM signature of an email as RFC 6376 describes: the body hash, the signed headers (the sender must be one of them), the RSA-SHA256 signature
 * against the key published in DNS, and that the signing domain is the sender's domain or a parent of it. It never throws: any malformed input is a failure.
 */
export async function verifyDkim(raw: string, resolveKey: KeyResolver): Promise<DkimResult> {
  try {
    const parts = split(raw);
    const signed = parts?.headers.find((header) => header.name === "dkim-signature");
    if (!parts || !signed) return fail("no-signature");
    const tags = tagsOf(signed.raw.slice(signed.raw.indexOf(":") + 1));
    const [domain, selector, signedHeaders, bodyHash, signature] = ["d", "s", "h", "bh", "b"].map((tag) => tags.get(tag));
    if (!domain || !selector || !signedHeaders || !bodyHash || !signature || tags.get("v") !== "1" || tags.get("a") !== "rsa-sha256") return fail("unsupported");
    const [headerMode = "simple", bodyMode = "simple"] = (tags.get("c") ?? "simple/simple").split("/");
    const names = signedHeaders.toLowerCase().split(":").filter(Boolean);
    if (!names.includes("from")) return fail("from-not-signed");

    let body = canonicalBody(parts.body, bodyMode === "relaxed");
    const limit = tags.get("l");
    if (limit !== undefined) body = body.slice(0, Number(limit));
    if (toBase64(sha256(text.encode(body))) !== bodyHash) return fail("body-hash");

    const record = await resolveKey(`${selector}._domainkey.${domain}`);
    const publicKey = tagsOf(record ?? "").get("p");
    const key = publicKey ? rsaKey(fromBase64(publicKey)) : null;
    if (!key) return fail("no-key");

    const used = new Set<Header>();
    let data = "";
    for (const name of names) {
      const header = [...parts.headers].reverse().find((candidate) => candidate.name === name && !used.has(candidate));
      if (header) {
        used.add(header);
        data += canonicalHeader(header, headerMode === "relaxed");
      }
    }
    const withoutValue = { name: signed.name, raw: signed.raw.replace(/(\bb=)[^;]*/, "$1") };
    data += canonicalHeader(withoutValue, headerMode === "relaxed").replace(/\r\n$/, "");
    if (!verifyRsaSha256(key, fromBase64(signature), sha256(text.encode(data)))) return fail("signature");

    const from = (relaxedValue((parts.headers.find((header) => header.name === "from") as Header).raw).match(/<([^>]+)>/)?.[1] ?? relaxedValue((parts.headers.find((header) => header.name === "from") as Header).raw)).toLowerCase();
    const senderDomain = from.split("@")[1] ?? "";
    if (senderDomain !== domain.toLowerCase() && !senderDomain.endsWith(`.${domain.toLowerCase()}`)) return fail("misaligned");
    const signedAt = Number(tags.get("t"));
    return { ok: true, domain: domain.toLowerCase(), selector, from, signedAt: Number.isInteger(signedAt) ? signedAt : null };
  } catch {
    return fail("signature");
  }
}

/** A key resolver over a DNS-over-HTTPS JSON endpoint (the enclave has HTTP and no DNS). */
export function dohResolver(fetchImpl: (url: string) => Promise<Response>, endpoint = "https://dns.google/resolve"): KeyResolver {
  return async (name) => {
    try {
      const response = await fetchImpl(`${endpoint}?name=${encodeURIComponent(name)}&type=TXT`);
      if (!response.ok) return null;
      const body = (await response.json()) as { Status?: number; Answer?: { type: number; data: string }[] };
      const answer = body.Status === 0 ? body.Answer?.find((entry) => entry.type === 16) : undefined;
      return answer ? answer.data.replace(/"\s*"/g, "").replace(/^"|"$/g, "") : null;
    } catch {
      return null;
    }
  };
}
