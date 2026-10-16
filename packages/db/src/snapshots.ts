import type { Sql } from "postgres";

type Network = "testnet" | "mainnet";

export async function saveSnapshot(sql: Sql, snapshot: { network: Network; asOfBlock: bigint; payload: unknown; state: unknown }): Promise<void> {
  await sql`insert into metric_snapshots (network, as_of_block, payload, state) values (${snapshot.network}, ${snapshot.asOfBlock.toString()}, ${sql.json(snapshot.payload as never)}, ${sql.json(snapshot.state as never)})`;
}

export async function latestSnapshot<P = unknown, S = unknown>(sql: Sql, network: Network): Promise<{ takenAt: Date; asOfBlock: bigint; payload: P; state: S } | undefined> {
  const [row] = await sql<{ taken_at: Date; as_of_block: string; payload: P; state: S }[]>`select taken_at, as_of_block, payload, state from metric_snapshots where network = ${network} order by id desc limit 1`;
  return row ? { takenAt: row.taken_at, asOfBlock: BigInt(row.as_of_block), payload: row.payload, state: row.state } : undefined;
}
