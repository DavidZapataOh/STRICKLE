import postgres, { type Sql } from "postgres";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

export function describeDatabase(url: string): { host: string; database: string; local: boolean; pooled: boolean } {
  const parsed = new URL(url);
  if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") throw new Error("the database URL must be a postgres URL");
  const host = parsed.hostname;
  return {
    host,
    database: parsed.pathname.replace(/^\//, ""),
    local: LOCAL_HOSTS.has(host),
    pooled: host.includes("pooler") || parsed.searchParams.get("pgbouncer") === "true",
  };
}

export function confirmTarget(url: string, confirmedHost: string | undefined): void {
  const target = describeDatabase(url);
  if (target.local || confirmedHost === target.host) return;
  throw new Error(`${target.host} is not a local database: rerun with --confirm-host=${target.host} to change it`);
}

export async function pingDatabase(sql: Sql): Promise<{ ms: number }> {
  const started = performance.now();
  await sql`select 1`;
  return { ms: Math.round(performance.now() - started) };
}

export function connect(url: string, options: { max?: number } = {}): Sql {
  const target = describeDatabase(url);
  return postgres(url, {
    max: options.max ?? (target.local ? 4 : 1),
    ssl: target.local ? false : "require",
    prepare: !target.pooled,
    idle_timeout: 20,
    connect_timeout: 10,
  });
}
