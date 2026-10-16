import { hasLocale } from "@strickle/design/locale";
import { NextResponse, type NextRequest } from "next/server";
import { type AgentMode, capabilities } from "./agent-mode.ts";

// Screens that exist only because an agent does. Everything else the app serves (access, closed, verify, docs, metrics, view, accountant, unavailable) works without one.
const AGENT_SCREENS = ["", "start", "activity", "boxes", "settings"];

export function isAgentScreen(pathname: string): boolean {
  const [, lang, page = ""] = pathname.split("/");
  return lang !== undefined && hasLocale(lang) && AGENT_SCREENS.includes(page);
}

/** With no agent on the network the app's own screens answer one honest page, instead of reading deployments that do not exist. */
export function unavailableResponse(request: NextRequest, mode: AgentMode): NextResponse | undefined {
  const { pathname } = request.nextUrl;
  if (capabilities(mode).app || !isAgentScreen(pathname)) return undefined;
  return NextResponse.rewrite(new URL(`/${pathname.split("/")[1]}/unavailable`, request.url));
}
