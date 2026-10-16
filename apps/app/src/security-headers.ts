// Later screens that talk to the chain or to Circle add their origins through `connect`.
export function contentSecurityPolicy(connect: readonly string[] = []): string {
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
  ].join("; ");
}

export function securityHeaders(connect: readonly string[] = []): { key: string; value: string }[] {
  return [
    { key: "Content-Security-Policy", value: contentSecurityPolicy(connect) },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  ];
}
