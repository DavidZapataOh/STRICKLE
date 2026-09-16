import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { checkToolchain } from './toolchain.ts';

type Files = Record<string, string | object>;
type Json = Record<string, Record<string, unknown>>;

const compiler = { version: '0.31.1', language: '0.23.0', runtime: '0.16.0' };
const nodeVersion = '24.14.0';
const compose = [
  'services:',
  '  node:',
  '    image: midnightntwrk/midnight-node:1.0.2',
  '  indexer:',
  '    image: midnightntwrk/indexer-standalone:4.3.3-hotfix',
  '  proof-server:',
  '    image: midnightntwrk/proof-server:8.1.0',
  '',
].join('\n');

function validFiles(): Files {
  return {
    'package.json': {
      name: 'fixture',
      engines: { node: '>=24.11.1' },
      workspaces: ['contract', 'cli'],
      devDependencies: { typescript: '6.0.3' },
    },
    'contract/package.json': {
      name: '@fixture/contract',
      scripts: { compact: 'compact compile +0.31.1 src/c.compact src/managed/c' },
      dependencies: { '@midnight-ntwrk/compact-runtime': '0.16.0' },
    },
    'contract/src/c.compact': 'pragma language_version 0.23;\n',
    'contract/src/managed/c/generated.compact': 'pragma language_version >= 0.20;\n',
    'cli/package.json': {
      name: '@fixture/cli',
      dependencies: {
        '@midnight-ntwrk/midnight-js-contracts': '4.1.1',
        '@midnight-ntwrk/wallet-sdk': '1.2.0',
      },
    },
    'cli/docker-compose.yml': compose,
    'package-lock.json': {
      packages: {
        '': { name: 'fixture' },
        contract: { name: '@fixture/contract' },
        'node_modules/@fixture/contract': { resolved: 'contract', link: true },
        'node_modules/@midnight-ntwrk/compact-runtime': { version: '0.16.0' },
        'node_modules/@midnight-ntwrk/midnight-js-protocol/node_modules/@midnight-ntwrk/compact-js': {
          version: '2.5.1',
        },
        'node_modules/typescript': { version: '6.0.3' },
        'node_modules/@types/node': { version: '24.13.5' },
      },
    },
    '.compact-version': '0.31.1\n',
    '.nvmrc': '24.14.0\n',
    'toolchain.json': {
      packages: {
        '@midnight-ntwrk/midnight-js-*': '4.1.1',
        '@midnight-ntwrk/wallet-sdk': '1.2.0',
      },
      compose: 'cli/docker-compose.yml',
      images: {
        'midnightntwrk/midnight-node': '1.0.2',
        'midnightntwrk/indexer-standalone': '4.3.3-hotfix',
        'midnightntwrk/proof-server': '8.1.0',
      },
    },
  };
}

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function repo(change: (files: Files) => void = () => {}): string {
  const files = validFiles();
  change(files);
  const root = mkdtempSync(join(tmpdir(), 'toolchain-'));
  roots.push(root);
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), typeof content === 'string' ? content : JSON.stringify(content, null, 2));
  }
  return root;
}

const json = (files: Files, path: string) => files[path] as Json;

describe('checkToolchain', () => {
  it('accepts a repository that matches the matrix', () => {
    expect(checkToolchain({ root: repo(), compiler, nodeVersion })).toEqual([]);
  });

  it('rejects a missing engines.node', () => {
    const root = repo((files) => {
      delete json(files, 'package.json').engines;
    });
    expect(checkToolchain({ root, compiler, nodeVersion })).toEqual(['package.json: engines.node is missing']);
  });

  it('rejects a Node version that differs from .nvmrc', () => {
    expect(checkToolchain({ root: repo(), compiler, nodeVersion: '24.11.1' })).toEqual([
      '.nvmrc is 24.14.0, but node is 24.11.1',
    ]);
  });

  it('rejects a compiler that differs from .compact-version', () => {
    const root = repo((files) => {
      files['.compact-version'] = '0.30.0\n';
    });
    expect(checkToolchain({ root, compiler, nodeVersion })).toEqual([
      '.compact-version is 0.30.0, but compact compile --version reports 0.31.1',
      'contract/package.json: scripts.compact must call "compact compile +0.30.0"',
    ]);
  });

  it('rejects a compile script without the pinned compiler', () => {
    const root = repo((files) => {
      json(files, 'contract/package.json').scripts.compact = 'compact compile src/c.compact src/managed/c';
    });
    expect(checkToolchain({ root, compiler, nodeVersion })).toEqual([
      'contract/package.json: scripts.compact must call "compact compile +0.31.1"',
    ]);
  });

  it('rejects a version range', () => {
    const root = repo((files) => {
      json(files, 'cli/package.json').dependencies['@midnight-ntwrk/wallet-sdk'] = '^1.2.0';
    });
    expect(checkToolchain({ root, compiler, nodeVersion })).toEqual([
      'cli/package.json: dependencies.@midnight-ntwrk/wallet-sdk is "^1.2.0", expected an exact version',
    ]);
  });

  it('rejects a Midnight package outside the matrix', () => {
    const root = repo((files) => {
      json(files, 'cli/package.json').dependencies['@midnight-ntwrk/midnight-js-contracts'] = '4.0.0';
    });
    expect(checkToolchain({ root, compiler, nodeVersion })).toEqual([
      'cli/package.json: dependencies.@midnight-ntwrk/midnight-js-contracts is 4.0.0, expected 4.1.1',
    ]);
  });

  it('rejects a compact-runtime that differs from the compiler runtime', () => {
    const root = repo((files) => {
      json(files, 'contract/package.json').dependencies['@midnight-ntwrk/compact-runtime'] = '0.15.0';
    });
    expect(checkToolchain({ root, compiler, nodeVersion })).toEqual([
      'contract/package.json: dependencies.@midnight-ntwrk/compact-runtime is 0.15.0, expected 0.16.0',
    ]);
  });

  it('rejects compact-js as a direct dependency', () => {
    const root = repo((files) => {
      json(files, 'cli/package.json').dependencies['@midnight-ntwrk/compact-js'] = '2.5.1';
    });
    expect(checkToolchain({ root, compiler, nodeVersion })).toEqual([
      '@midnight-ntwrk/compact-js is a direct dependency of @fixture/cli',
    ]);
  });

  it('rejects two resolved copies of a single-copy package', () => {
    const root = repo((files) => {
      json(files, 'package-lock.json').packages['cli/node_modules/typescript'] = { version: '5.9.3' };
    });
    expect(checkToolchain({ root, compiler, nodeVersion })).toEqual([
      'package-lock.json: typescript resolves to 5.9.3, 6.0.3, expected one version',
    ]);
  });

  it('rejects Node types outside major 24', () => {
    const root = repo((files) => {
      json(files, 'package-lock.json').packages['node_modules/@types/node'] = { version: '22.20.3' };
    });
    expect(checkToolchain({ root, compiler, nodeVersion })).toEqual([
      'package-lock.json: @types/node resolves to 22.20.3, expected major 24',
    ]);
  });

  it('rejects a pragma range and ignores compiler output', () => {
    const root = repo((files) => {
      files['contract/src/c.compact'] = 'pragma language_version >= 0.23;\n';
    });
    expect(checkToolchain({ root, compiler, nodeVersion })).toEqual([
      'contract/src/c.compact: pragma is ">= 0.23", expected "0.23"',
    ]);
  });

  it('rejects a missing pragma', () => {
    const root = repo((files) => {
      files['contract/src/c.compact'] = 'export circuit noop(): [] {}\n';
    });
    expect(checkToolchain({ root, compiler, nodeVersion })).toEqual([
      'contract/src/c.compact: pragma is missing, expected "0.23"',
    ]);
  });

  it('rejects a devnet image outside the matrix', () => {
    const root = repo((files) => {
      files['cli/docker-compose.yml'] = compose.replace('midnight-node:1.0.2', 'midnight-node:1.0.0');
    });
    expect(checkToolchain({ root, compiler, nodeVersion })).toEqual([
      'cli/docker-compose.yml: midnightntwrk/midnight-node is 1.0.0, expected 1.0.2',
    ]);
  });

  it('rejects a missing devnet image', () => {
    const root = repo((files) => {
      files['cli/docker-compose.yml'] = compose.replace('    image: midnightntwrk/proof-server:8.1.0\n', '');
    });
    expect(checkToolchain({ root, compiler, nodeVersion })).toEqual([
      'cli/docker-compose.yml: midnightntwrk/proof-server is missing',
    ]);
  });
});
