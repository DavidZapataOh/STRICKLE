import { readFile } from "node:fs/promises";
/** Loads `<directory>/<name>.json` compiled artifacts from disk. */
export function nodeCircuitLoader(directory) {
    const base = typeof directory === "string" ? new URL(directory, "file:///") : directory;
    return async (name) => {
        if (!/^[a-z][a-z0-9_]*$/.test(name))
            throw new Error(`invalid circuit name: ${name}`);
        return JSON.parse(await readFile(new URL(`${name}.json`, base), "utf8"));
    };
}
