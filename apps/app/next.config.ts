import type { NextConfig } from "next";
import { appNetwork, connectOrigins } from "./src/config/network.ts";
import { depositConnectOrigins } from "./src/deposit/csp.ts";
import { securityHeaders } from "./src/security-headers.ts";

const nextConfig: NextConfig = {
  devIndicators: false,
  cacheComponents: true,
  partialPrefetching: true,
  transpilePackages: ["@strickle/design", "@strickle/core", "@strickle/tax-engine", "@strickle/arc", "@strickle/prover", "@strickle/agent", "@strickle/brain", "@strickle/db", "@strickle/pool"],
  outputFileTracingIncludes: { "/**": ["../../packages/tax-engine/rules/**/*", "../../packages/tax-engine/calendars/**/*", "../../packages/tax-engine/fx/**/*"] },
  turbopack: { rules: { "*.css": { loaders: ["@tailwindcss/turbopack"], as: "*.css" } } },
  async headers() {
    const base = connectOrigins();
    return [
      { source: "/:path*", headers: securityHeaders(base) },
      // listed after the global entry: for the same header the more specific route wins
      { source: "/:lang/deposit", headers: securityHeaders([...base, ...depositConnectOrigins(appNetwork())]) },
    ];
  },
};

export default nextConfig;
