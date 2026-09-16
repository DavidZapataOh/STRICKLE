const HTTP = ["http:", "https:"];
const WS = ["ws:", "wss:"];

const URLS: Record<string, string[]> = {
  MIDNIGHT_INDEXER_URL: HTTP,
  MIDNIGHT_INDEXER_WS_URL: WS,
  MIDNIGHT_NODE_URL: WS,
  MIDNIGHT_PROOF_SERVER_URL: HTTP,
  MIDNIGHT_FAUCET_URL: HTTP,
};

export const KNOWN = [
  ...Object.keys(URLS),
  "MIDNIGHT_FAUCET_TIMEOUT_MS",
  "PRIVATE_STATE_PASSWORD",
  "MIDNIGHT_WALLET_SEED",
  "MIDNIGHT_WALLET_MNEMONIC",
];

const PASSWORD_MINIMUM = 16;

export function checkEnv(env: Record<string, string | undefined>): string[] {
  const errors: string[] = [];

  for (const [name, schemes] of Object.entries(URLS)) {
    const value = env[name];
    if (!value) continue;
    let parsed: URL;
    try {
      parsed = new URL(value);
    } catch {
      errors.push(`${name} is "${value}", expected a URL`);
      continue;
    }
    if (!schemes.includes(parsed.protocol)) {
      errors.push(`${name} uses ${parsed.protocol}, expected ${schemes.join(" or ")}`);
    }
  }

  const timeout = env.MIDNIGHT_FAUCET_TIMEOUT_MS;
  if (timeout && !(Number(timeout) > 0)) {
    errors.push(
      `MIDNIGHT_FAUCET_TIMEOUT_MS is "${timeout}", expected a positive number of milliseconds`,
    );
  }

  const password = env.PRIVATE_STATE_PASSWORD;
  if (password && password.length < PASSWORD_MINIMUM) {
    errors.push(
      `PRIVATE_STATE_PASSWORD is ${password.length} characters, the minimum is ${PASSWORD_MINIMUM}`,
    );
  }

  return errors;
}
