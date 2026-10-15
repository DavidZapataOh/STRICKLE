const TAG = "$bigint";

export function encode(value: unknown): Buffer {
  return Buffer.from(JSON.stringify(value, (_, v) => (typeof v === "bigint" ? { [TAG]: v.toString() } : v)));
}

export function decode<T>(bytes: Uint8Array): T {
  const text = Buffer.from(bytes).toString("utf8");
  return JSON.parse(text, (_, v) => {
    const tagged = v !== null && typeof v === "object" && Object.keys(v).length === 1 && typeof v[TAG] === "string";
    return tagged ? BigInt(v[TAG]) : v;
  }) as T;
}
