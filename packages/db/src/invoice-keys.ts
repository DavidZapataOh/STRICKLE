import { createHash, createHmac, hkdfSync } from "node:crypto";

export interface InvoiceKeys {
  /** Seals the text a freelancer typed: label, payee name, note. */
  seal: Buffer;
  /** Derives payment-link tokens, so the server can show a link again without storing it. */
  link: Buffer;
  /** Signs the owner-session cookie. */
  session: Buffer;
}

const derive = (secret: Buffer, purpose: string): Buffer => Buffer.from(hkdfSync("sha256", secret, Buffer.alloc(0), `strickle/invoices/${purpose}/v1`, 32));

export function invoiceKeys(secretBase64: string): InvoiceKeys {
  const secret = Buffer.from(secretBase64, "base64");
  if (secret.length !== 32) throw new Error("INVOICE_SECRET must be 32 bytes, base64 encoded");
  return { seal: derive(secret, "seal"), link: derive(secret, "link"), session: derive(secret, "session") };
}

export function linkToken(keys: InvoiceKeys, invoiceId: string, version: number): string {
  return createHmac("sha256", keys.link).update(`${invoiceId}:${version}`).digest().subarray(0, 16).toString("base64url");
}

export const tokenHash = (token: string): string => createHash("sha256").update(token).digest("hex");
