import type { OnrampConfig } from "../onramp/environment.ts";
import { permissionsPolicy } from "../security-headers.ts";

/** The widget's own origin and every frame the widget embeds in turn: a permission granted to the widget does not reach a frame it embeds unless that frame's origin is listed too. The nested origins are read off a real sandbox session. */
export const WIDGET_FRAME_ORIGINS: Record<"sandbox" | "production", readonly string[]> = {
  sandbox: ["https://onramp-sandbox.arc.io"],
  production: ["https://onramp.arc.io"],
};

/** What the payer's page widens when card payments are configured, and nothing otherwise. */
export function cardHeaderExtra(card: OnrampConfig | null): { connect?: readonly string[]; frames?: readonly string[]; permissions?: string } {
  if (!card) return {};
  const origins = WIDGET_FRAME_ORIGINS[card.environment];
  return {
    connect: [card.widgetOrigin, card.apiOrigin],
    frames: origins,
    permissions: permissionsPolicy({ camera: origins, microphone: origins, payment: origins, clipboardRead: origins, clipboardWrite: origins }),
  };
}
