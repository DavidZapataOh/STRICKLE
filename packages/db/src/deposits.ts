import type { Sql } from "postgres";

export type DepositIntent = "income" | "own" | "unsure";
export type DepositStatus = "created" | "swapped" | "burned" | "arrived" | "failed";
export type InputToken = "USDC" | "USDT";
type Speed = "fast" | "slow";
type FeeMode = "source" | "destination";

export interface DepositRow {
  id: string;
  vault: string;
  sourceChain: string;
  sourceAddress: string;
  amount: bigint;
  speed: Speed;
  feeMode: FeeMode;
  intent: DepositIntent;
  status: DepositStatus;
  burnTx: string | null;
  forwardTx: string | null;
  received: bigint | null;
  failure: string | null;
  inputToken: InputToken;
  swapTx: string | null;
  swapOut: bigint | null;
  createdAt: Date;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function createDeposit(sql: Sql, input: { vault: string; sourceChain: string; sourceAddress: string; amount: bigint; speed: Speed; feeMode: FeeMode; intent: DepositIntent; inputToken?: InputToken }): Promise<string> {
  const [row] = await sql<{ id: string }[]>`
    insert into deposit_intents (vault, source_chain, source_address, amount, speed, fee_mode, intent, input_token)
    values (${input.vault.toLowerCase()}, ${input.sourceChain}, ${input.sourceAddress.toLowerCase()}, ${input.amount.toString()}, ${input.speed}, ${input.feeMode}, ${input.intent}, ${input.inputToken ?? "USDC"})
    returning id`;
  if (!row) throw new Error("deposit: no row returned");
  return row.id;
}

export async function recordBurn(sql: Sql, id: string, burnTx: string): Promise<boolean> {
  const rows = await sql`update deposit_intents set status = 'burned', burn_tx = ${burnTx.toLowerCase()}, updated_at = now() where id = ${id} and ((status = 'created' and input_token = 'USDC') or status = 'swapped') returning id`;
  return rows.length === 1;
}

/** Arrival may follow a burn, or a failure that was only a timeout on our side: the chain is the authority. */
export async function recordArrival(sql: Sql, id: string, input: { forwardTx: string; received: bigint }): Promise<boolean> {
  const rows = await sql`
    update deposit_intents set status = 'arrived', forward_tx = ${input.forwardTx.toLowerCase()}, received = ${input.received.toString()}, failure = null, updated_at = now()
    where id = ${id} and burn_tx is not null and status in ('burned', 'failed') returning id`;
  return rows.length === 1;
}

export async function recordSwap(sql: Sql, id: string, input: { swapTx: string; swapOut: bigint }): Promise<boolean> {
  const rows = await sql`update deposit_intents set status = 'swapped', swap_tx = ${input.swapTx.toLowerCase()}, swap_out = ${input.swapOut.toString()}, updated_at = now() where id = ${id} and status = 'created' and input_token = 'USDT' returning id`;
  return rows.length === 1;
}

export async function failDeposit(sql: Sql, id: string, failure: string): Promise<boolean> {
  const rows = await sql`update deposit_intents set status = 'failed', failure = ${failure.slice(0, 64)}, updated_at = now() where id = ${id} and status in ('created', 'swapped', 'burned') returning id`;
  return rows.length === 1;
}

export async function getDeposit(sql: Sql, id: string): Promise<DepositRow | null> {
  if (!UUID.test(id)) return null;
  const [row] = await sql<Record<string, unknown>[]>`select * from deposit_intents where id = ${id}`;
  if (!row) return null;
  return {
    id: row.id as string,
    vault: row.vault as string,
    sourceChain: row.source_chain as string,
    sourceAddress: row.source_address as string,
    amount: BigInt(row.amount as string),
    speed: row.speed as Speed,
    feeMode: row.fee_mode as FeeMode,
    intent: row.intent as DepositIntent,
    status: row.status as DepositStatus,
    burnTx: row.burn_tx as string | null,
    forwardTx: row.forward_tx as string | null,
    received: row.received === null ? null : BigInt(row.received as string),
    failure: row.failure as string | null,
    inputToken: row.input_token as InputToken,
    swapTx: row.swap_tx as string | null,
    swapOut: row.swap_out === null ? null : BigInt(row.swap_out as string),
    createdAt: row.created_at as Date,
  };
}
