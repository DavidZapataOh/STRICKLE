// Later screens that talk to the chain or to Circle add their origins through `connect`.
export function contentSecurityPolicy(connect: readonly string[] = [], frames: readonly string[] = []): string {
  return [
    "default-src 'self'",
    // Next inlines its bootstrap scripts; a nonce or SRI based policy replaces 'unsafe-inline' once the pages stop being static
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    `connect-src ${["'self'", ...connect].join(" ")}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(frames.length > 0 ? [`frame-src ${frames.join(" ")}`] : []),
  ].join("; ");
}

export interface PermissionsGrant {
  camera?: readonly string[];
  microphone?: readonly string[];
  payment?: readonly string[];
  clipboardRead?: readonly string[];
  clipboardWrite?: readonly string[];
}

const list = (origins: readonly string[] = []) => `(${origins.map((origin) => `"${origin}"`).join(" ")})`;

/** Every feature is denied unless a route names the origins that may use it. A document's policy decides whether an embedded frame may use a feature at all, so a widget that needs the camera must be granted it here. */
export function permissionsPolicy(grant: PermissionsGrant = {}): string {
  return [
    `camera=${list(grant.camera)}`,
    `microphone=${list(grant.microphone)}`,
    "geolocation=()",
    `payment=${list(grant.payment)}`,
    ...(grant.clipboardRead?.length ? [`clipboard-read=${list(grant.clipboardRead)}`] : []),
    ...(grant.clipboardWrite?.length ? [`clipboard-write=${list(grant.clipboardWrite)}`] : []),
  ].join(", ");
}

export function securityHeaders(connect: readonly string[] = [], options: { frames?: readonly string[]; grant?: PermissionsGrant } = {}): { key: string; value: string }[] {
  return [
    { key: "Content-Security-Policy", value: contentSecurityPolicy(connect, options.frames) },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "Permissions-Policy", value: permissionsPolicy(options.grant) },
  ];
}
