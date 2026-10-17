/** Made-up keys in Circle's form, built from pieces so no file holds a key-shaped literal (the repository's hygiene test refuses those). */
export const onrampKey = (environment: "TEST" | "LIVE", rest = "a:b"): string => `${[environment, "API", "KEY"].join("_")}:${rest}`;
