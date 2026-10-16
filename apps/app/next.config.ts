import type { NextConfig } from "next";
import { securityHeaders } from "./src/security-headers.ts";

const nextConfig: NextConfig = {
  devIndicators: false,
  cacheComponents: true,
  partialPrefetching: true,
  transpilePackages: ["@strickle/design", "@strickle/core", "@strickle/tax-engine", "@strickle/arc", "@strickle/prover", "@strickle/agent"],
  outputFileTracingIncludes: { "/**": ["../../packages/tax-engine/rules/**/*", "../../packages/tax-engine/calendars/**/*", "../../packages/tax-engine/fx/**/*"] },
  turbopack: { rules: { "*.css": { loaders: ["@tailwindcss/turbopack"], as: "*.css" } } },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders() }];
  },
};

export default nextConfig;
