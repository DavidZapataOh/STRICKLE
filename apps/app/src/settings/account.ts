import type { Address } from "viem";
import { type Session, type SessionReader, loadSession } from "../account/session.ts";

export type Account = { owner: Address; vault: Address; username: string };

export const accountOf = (session: Session | null): Account | null => (session ? { owner: session.owner, vault: session.vault, username: session.username } : null);

export const currentAccount = (store?: SessionReader): Account | null => accountOf(loadSession(store));
