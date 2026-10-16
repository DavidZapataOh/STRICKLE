import type { ArcNetworkName } from "@strickle/arc/networks";
import { connectOrigins } from "../config/network.ts";
import { depositConnectOrigins } from "../deposit/csp.ts";
import { securityHeaders } from "../security-headers.ts";

/** The headers of the page a client opens from a link: private, never indexed, and allowed to call only Arc, Iris and the source chains. `extra` is how a later payment rail widens the policy; with none, nothing is added. */
export function payHeaders(network: ArcNetworkName, extra: { connect?: readonly string[]; frames?: readonly string[]; permissions?: string } = {}): { key: string; value: string }[] {
  const headers = securityHeaders([...connectOrigins(network), ...depositConnectOrigins(network), ...(extra.connect ?? [])]).map((header) => {
    if (header.key === "Referrer-Policy") return { key: header.key, value: "no-referrer" };
    if (header.key === "Content-Security-Policy" && extra.frames?.length) return { key: header.key, value: `${header.value}; frame-src ${extra.frames.join(" ")}` };
    if (header.key === "Permissions-Policy" && extra.permissions) return { key: header.key, value: extra.permissions };
    return header;
  });
  return [...headers, { key: "X-Robots-Tag", value: "noindex, nofollow" }, { key: "Cache-Control", value: "no-store" }];
}
