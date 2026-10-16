import { openSection } from "@strickle/pool/crypto/envelope";
import type { ViewKey } from "@strickle/pool/crypto/keys";
import { type AccountantView, decodeAccountantPayload } from "@strickle/pool/crypto/wire";
import { type Hex, decodeEventLog, parseAbi } from "viem";
import type { RawLog } from "../chain/logs.ts";

const abi = parseAbi(["event NotesInserted(uint32 indexed index, uint256 commitment0, uint256 commitment1, bytes ciphertext)"]);

export type AccountantNote = { leaf: number; output: 0 | 1; view: AccountantView };

/** What the pool sealed for the accountant tier and nothing else: a section that does not open, or does not parse, is simply not for this key. */
export function readAccountantNotes(logs: RawLog[], key: ViewKey): AccountantNote[] {
  const found: AccountantNote[] = [];
  for (const log of logs) {
    let decoded;
    try {
      decoded = decodeEventLog({ abi, data: log.data, topics: log.topics as [Hex, ...Hex[]] });
    } catch {
      continue;
    }
    const { index, commitment0, commitment1, ciphertext } = decoded.args;
    for (const output of [0, 1] as const) {
      if ((output === 0 ? commitment0 : commitment1) === 0n) continue;
      try {
        const bytes = openSection(ciphertext, output, "accountant", { publicKey: key.publicKey, secret: key.secret });
        if (bytes) found.push({ leaf: Number(index) + output, output, view: decodeAccountantPayload(bytes) });
      } catch {
        // a truncated or tampered section is not readable by anyone
      }
    }
  }
  return found.sort((a, b) => a.leaf - b.leaf);
}
