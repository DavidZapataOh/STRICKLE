import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface Compiler {
  version: string;
  language: string;
  runtime: string;
}

export interface ToolchainInput {
  root: string;
  compiler: Compiler;
  nodeVersion: string;
}

interface Manifest {
  name?: string;
  engines?: Record<string, string>;
  workspaces?: string[];
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

interface Matrix {
  packages: Record<string, string>;
  compose: string;
  images: Record<string, string>;
}

interface Lockfile {
  packages: Record<string, { version?: string }>;
}

const EXACT = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/;
const SINGLE_COPY = ['@midnight-ntwrk/compact-js', '@midnight-ntwrk/compact-runtime', 'typescript'];
const SKIPPED_DIRECTORIES = new Set(['.git', '.next', 'managed', 'node_modules']);

function compactFiles(root: string, directory = ''): string[] {
  return readdirSync(join(root, directory), { withFileTypes: true })
    .flatMap((entry) => {
      const path = directory ? `${directory}/${entry.name}` : entry.name;
      if (entry.isDirectory()) return SKIPPED_DIRECTORIES.has(entry.name) ? [] : compactFiles(root, path);
      return entry.name.endsWith('.compact') ? [path] : [];
    })
    .sort();
}

export function checkToolchain({ root, compiler, nodeVersion }: ToolchainInput): string[] {
  const text = (path: string) => readFileSync(join(root, path), 'utf8');
  const json = <T>(path: string) => JSON.parse(text(path)) as T;
  const errors: string[] = [];

  const rootManifest = json<Manifest>('package.json');
  if (!rootManifest.engines?.node) errors.push('package.json: engines.node is missing');
  const nvmrc = text('.nvmrc').trim().replace(/^v/, '');
  if (nodeVersion !== nvmrc) errors.push(`.nvmrc is ${nvmrc}, but node is ${nodeVersion}`);

  const pinned = text('.compact-version').trim();
  if (compiler.version !== pinned) {
    errors.push(`.compact-version is ${pinned}, but compact compile --version reports ${compiler.version}`);
  }

  const matrix = json<Matrix>('toolchain.json');
  const expectedVersion = (name: string) =>
    name === '@midnight-ntwrk/compact-runtime'
      ? compiler.runtime
      : Object.entries(matrix.packages).find(([pattern]) =>
          pattern.endsWith('*') ? name.startsWith(pattern.slice(0, -1)) : name === pattern,
        )?.[1];

  const manifests = ['package.json', ...(rootManifest.workspaces ?? []).map((w) => `${w}/package.json`)];
  for (const file of manifests) {
    const manifest = json<Manifest>(file);
    for (const field of ['dependencies', 'devDependencies'] as const) {
      for (const [name, spec] of Object.entries(manifest[field] ?? {})) {
        if (name === '@midnight-ntwrk/compact-js') {
          errors.push(`@midnight-ntwrk/compact-js is a direct dependency of ${manifest.name}`);
        }
        const expected = expectedVersion(name);
        if (!EXACT.test(spec)) errors.push(`${file}: ${field}.${name} is "${spec}", expected an exact version`);
        else if (expected && spec !== expected) errors.push(`${file}: ${field}.${name} is ${spec}, expected ${expected}`);
      }
    }
    for (const [name, script] of Object.entries(manifest.scripts ?? {})) {
      if (script.includes('compact compile') && !script.includes(`compact compile +${pinned} `)) {
        errors.push(`${file}: scripts.${name} must call "compact compile +${pinned}"`);
      }
    }
  }

  const resolved = new Map<string, Set<string>>();
  for (const [path, entry] of Object.entries(json<Lockfile>('package-lock.json').packages)) {
    if (!path.includes('node_modules/') || !entry.version) continue;
    const name = path.slice(path.lastIndexOf('node_modules/') + 'node_modules/'.length);
    resolved.set(name, (resolved.get(name) ?? new Set<string>()).add(entry.version));
  }
  for (const name of SINGLE_COPY) {
    const versions = [...(resolved.get(name) ?? [])].sort();
    if (versions.length > 1) {
      errors.push(`package-lock.json: ${name} resolves to ${versions.join(', ')}, expected one version`);
    }
  }
  for (const version of [...(resolved.get('@types/node') ?? [])].sort()) {
    if (!version.startsWith('24.')) errors.push(`package-lock.json: @types/node resolves to ${version}, expected major 24`);
  }

  const language = compiler.language.split('.').slice(0, 2).join('.');
  for (const file of compactFiles(root)) {
    const pragma = text(file).match(/^pragma language_version (.+);$/m)?.[1];
    if (pragma !== language) {
      errors.push(`${file}: pragma is ${pragma === undefined ? 'missing' : `"${pragma}"`}, expected "${language}"`);
    }
  }

  const compose = text(matrix.compose);
  for (const [image, expected] of Object.entries(matrix.images)) {
    const escaped = image.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const tag = compose.match(new RegExp(`image:\\s*['"]?${escaped}:([^'"\\s]+)`))?.[1];
    if (tag === undefined) errors.push(`${matrix.compose}: ${image} is missing`);
    else if (tag !== expected) errors.push(`${matrix.compose}: ${image} is ${tag}, expected ${expected}`);
  }

  return errors;
}
