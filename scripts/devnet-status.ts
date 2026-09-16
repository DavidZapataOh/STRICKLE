import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { NETWORK_CONFIGS } from '../strickle-cli/src/network.ts';
import { parseComposePs, probe, readGenesis, summarizeStatus } from './devnet.ts';

const { compose, devnetGenesis } = JSON.parse(readFileSync('toolchain.json', 'utf8')) as {
  compose: string;
  devnetGenesis: string;
};

const config = NETWORK_CONFIGS.undeployed;
const rpcUrl = config.node.replace(/^ws/, 'http');

const containers = parseComposePs(
  execFileSync('docker', ['compose', '-f', compose, 'ps', '-a', '--format', 'json'], { encoding: 'utf8' }),
);

const probes = await Promise.all([
  probe('indexer', `${new URL(config.indexer).origin}/ready`),
  probe('proof-server', `${config.proofServer}/health`),
]);

const genesis = await readGenesis(rpcUrl);

for (const { service, status, error, ms } of probes) {
  console.log(`${service.padEnd(13)}${String(status ?? error).padEnd(10)}${ms} ms`);
}
console.log(`node${''.padEnd(9)}${genesis ?? 'unknown'}`);

const errors = summarizeStatus({
  services: config.composeServices,
  containers,
  probes,
  genesis,
  expectedGenesis: devnetGenesis,
});

if (errors.length > 0) {
  console.error(errors.join('\n'));
  process.exit(1);
}

console.log('devnet ok');
