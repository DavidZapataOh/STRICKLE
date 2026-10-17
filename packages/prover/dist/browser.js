/** Loads `<baseUrl>/<name>.json` compiled circuits over HTTP. */
export function urlCircuitLoader(baseUrl) {
    const base = baseUrl.replace(/\/$/, "");
    return async (name) => {
        if (!/^[a-z][a-z0-9_]*$/.test(name))
            throw new Error(`invalid circuit name: ${name}`);
        const response = await fetch(`${base}/${name}.json`);
        if (!response.ok)
            throw new Error(`could not load circuit ${name}: ${response.status}`);
        return (await response.json());
    };
}
/** The hosts Barretenberg hard-codes for the structured reference string. */
const CRS_HOSTS = new Set(["crs.aztec-cdn.foundation", "crs.aztec-labs.com"]);
/**
 * Serves the reference string from our own origin: requests to the two CDN hosts are rewritten to
 * `<baseUrl>/<file>` (range headers preserved). Returns a function that restores the original `fetch`.
 */
export function hostedCrs(baseUrl) {
    const base = baseUrl.replace(/\/$/, "");
    const original = globalThis.fetch;
    globalThis.fetch = ((input, init) => {
        const raw = input instanceof Request ? input.url : String(input);
        const url = new URL(raw, globalThis.location?.href);
        if (!CRS_HOSTS.has(url.hostname))
            return original(input, init);
        const target = `${base}${url.pathname}`;
        return original(input instanceof Request ? new Request(target, input) : target, init);
    });
    return () => {
        globalThis.fetch = original;
    };
}
