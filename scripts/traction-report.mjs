// Prints the traction answers from the latest recorded snapshot of the public metrics.
//   node scripts/traction-report.mjs --url https://<the app>/api/metrics
// The numbers are the chain's (the metrics collector read them); nothing here is typed in.

const MICRO = 1_000_000n;

/** Base units of USDC as US$ with grouping, exact for any size. */
function dollars(units) {
  const value = BigInt(units);
  const whole = (value / MICRO).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const cents = (value % MICRO).toString().padStart(6, "0").replace(/0+$/, "");
  return `US$${whole}.${cents.padEnd(2, "0")}`;
}

export function tractionReport(metrics) {
  const { vaults, usdcAllocated } = metrics;
  const test = metrics.network === "testnet" ? "test USDC" : "USDC";
  const lines = [`Businesses onboarded: ${vaults.total} (${vaults.organic} outside the team, ${vaults.team} ours)`];
  const moved = metrics.agentMoved;
  lines.push(moved ? `Value the agent moved: ${dollars(moved.total.total)} (${dollars(moved.total.organic)} outside the team, ${dollars(moved.total.team)} ours)` : "Value the agent moved: not measured in this snapshot");
  lines.push(`Income split into boxes: ${dollars(usdcAllocated.total)} (${dollars(usdcAllocated.organic)} outside the team, ${dollars(usdcAllocated.team)} ours)`);
  const movedSentence = moved ? ` The agent moved ${dollars(moved.total.total)} in ${test}: ${dollars(moved.total.organic)} for people outside the team and ${dollars(moved.total.team)} for ours.` : "";
  const paragraph = `As of block ${metrics.asOfBlock} on Arc ${metrics.network}: ${vaults.total} businesses have created an account (${vaults.organic} outside the team, ${vaults.team} ours).${movedSentence} ${dollars(usdcAllocated.total)} of income was split into boxes. Everything is read from the chain; ${test} is ${metrics.network === "testnet" ? "not real money" : "real money"}.`;
  return `${lines.join("\n")}\n\n${paragraph}`;
}

if (import.meta.main) {
  const index = process.argv.indexOf("--url");
  const url = index >= 0 ? process.argv[index + 1] : process.env.METRICS_URL;
  if (!url) {
    console.error("usage: node scripts/traction-report.mjs --url https://<the app>/api/metrics");
    process.exit(1);
  }
  const response = await fetch(url);
  if (!response.ok) {
    console.error(`the metrics answered ${response.status}: there is no snapshot to report yet`);
    process.exit(1);
  }
  console.log(tractionReport(await response.json()));
}
