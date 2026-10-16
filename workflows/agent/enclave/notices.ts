// workflows/agent/enclave/notices.ts
import { hkdf } from "@noble/hashes/hkdf.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { open, scalarFrom, sealWith } from "@strickle/prover/sealed";
import { type Address, hexToBytes, numberToBytes } from "viem";

import type { Notice } from "./notice-schema.ts";

export type { Notice };

const utf8 = (value: string) => new TextEncoder().encode(value);
const concat = (...parts: Uint8Array[]) => Uint8Array.from(parts.flatMap((part) => [...part]));
const idBytes = (id: bigint) => numberToBytes(id, { size: 8 });

export const noticeAad = (vault: Address, id: bigint): Uint8Array => concat(utf8("strickle/notice/v1"), hexToBytes(vault), idBytes(id));

export function sealNotice(master: Uint8Array, userKey: Uint8Array, vault: Address, id: bigint, notice: Notice): Uint8Array {
  const plaintext = utf8(JSON.stringify(notice));
  // The ephemeral key also binds the plaintext: two publishers racing for the same id (the loser's report is refused but its bytes are public) must never share a key.
  const ephemeral = scalarFrom(hkdf(sha256, master, concat(hexToBytes(vault), idBytes(id), sha256(plaintext)), utf8("strickle/notice-esk/v2"), 64));
  return sealWith(plaintext, userKey, noticeAad(vault, id), ephemeral);
}

export function openNotice(userSecret: bigint, userKey: Uint8Array, vault: Address, id: bigint, sealed: Uint8Array): Notice | undefined {
  const plain = open(sealed, userSecret, userKey, noticeAad(vault, id));
  return plain ? (JSON.parse(new TextDecoder().decode(plain)) as Notice) : undefined;
}
