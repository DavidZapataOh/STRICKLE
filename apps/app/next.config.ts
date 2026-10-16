import type { NextConfig } from "next";
import { connectOrigins } from "./src/config/network.ts";
import { securityHeaders } from "./src/security-headers.ts";

const nextConfig: NextConfig = {
  devIndicators: false,
  cacheComponents: true,
  partialPrefetching: true,
  transpilePackages: ["@strickle/design", "@strickle/core", "@strickle/tax-engine", "@strickle/arc", "@strickle/prover", "@strickle/agent", "@strickle/brain"],
  outputFileTracingIncludes: { "/**": ["../../packages/tax-engine/rules/**/*", "../../packages/tax-engine/calendars/**/*", "../../packages/tax-engine/fx/**/*"] },
  turbopack: { rules: { "*.css": { loaders: ["@tailwindcss/turbopack"], as: "*.css" } } },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders(connectOrigins()) }];
  },
};

export default nextConfig;
