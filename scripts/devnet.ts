export interface ContainerState {
  service: string;
  state: string;
  health?: string;
}

export interface ServiceProbe {
  service: string;
  url: string;
  status?: number;
  error?: string;
  ms: number;
}

export interface StatusInput {
  services: string[];
  containers: ContainerState[];
  probes: ServiceProbe[];
  genesis?: string;
  expectedGenesis: string;
}

interface ComposeRow {
  Service: string;
  State: string;
  Health?: string;
}

export function parseComposePs(output: string): ContainerState[] {
  const trimmed = output.trim();
  if (!trimmed) return [];
  return trimmed
    .split("\n")
    .flatMap((line) => {
      const value = JSON.parse(line) as ComposeRow | ComposeRow[];
      return Array.isArray(value) ? value : [value];
    })
    .map((row) => ({ service: row.Service, state: row.State, health: row.Health || undefined }));
}

export function summarizeStatus({
  services,
  containers,
  probes,
  genesis,
  expectedGenesis,
}: StatusInput): string[] {
  const errors: string[] = [];

  for (const service of services) {
    const container = containers.find((candidate) => candidate.service === service);
    if (!container) errors.push(`${service}: container is missing`);
    else if (container.state !== "running")
      errors.push(`${service}: container is ${container.state}`);
    else if (container.health && container.health !== "healthy") {
      errors.push(`${service}: container is ${container.health}`);
    }
  }

  for (const { service, url, status, error } of probes) {
    if (error) errors.push(`${service}: ${url} is unreachable (${error})`);
    else if (status !== 200) errors.push(`${service}: ${url} returned ${status}`);
  }

  if (genesis === undefined) errors.push("node: genesis hash could not be read");
  else if (genesis !== expectedGenesis)
    errors.push(`node: genesis is ${genesis}, expected ${expectedGenesis}`);

  return errors;
}

export async function probe(service: string, url: string, timeoutMs = 5000): Promise<ServiceProbe> {
  const started = performance.now();
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    return { service, url, status: response.status, ms: Math.round(performance.now() - started) };
  } catch (error) {
    const name = error instanceof Error ? error.name : "Error";
    return { service, url, error: name, ms: Math.round(performance.now() - started) };
  }
}

export async function readGenesis(rpcUrl: string, timeoutMs = 5000): Promise<string | undefined> {
  try {
    const response = await fetch(rpcUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "chain_getBlockHash", params: [0] }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) return undefined;
    const { result } = (await response.json()) as { result?: unknown };
    return typeof result === "string" ? result : undefined;
  } catch {
    return undefined;
  }
}
