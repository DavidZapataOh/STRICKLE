import { existsSync, readFileSync, writeFileSync } from "node:fs";

const read = (file: string) => (existsSync(file) ? readFileSync(file, "utf8") : "");

const filled = (key: string) => new RegExp(`^${key}=.+$`, "m");
const placeholder = (key: string) => new RegExp(`^${key}=$`, "m");

export function assertSecretAbsent(file: string, key: string): void {
  if (filled(key).test(read(file))) {
    throw new Error(`${key} already exists in ${file}; refusing to overwrite it`);
  }
}

export function appendSecret(file: string, key: string, value: string): void {
  assertSecretAbsent(file, key);
  const current = read(file);
  if (placeholder(key).test(current)) {
    writeFileSync(file, current.replace(placeholder(key), () => `${key}=${value}`));
    return;
  }
  const separator = current && !current.endsWith("\n") ? "\n" : "";
  writeFileSync(file, `${current}${separator}${key}=${value}\n`, { mode: 0o600 });
}
