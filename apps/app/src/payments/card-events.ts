export type CardState =
  | { step: "idle" }
  | { step: "minting" }
  | { step: "widget"; sessionId: string }
  | { step: "submitted"; sessionId: string }
  | { step: "waiting"; sessionId: string }
  | { step: "settled" }
  | { step: "failed"; reason: "unavailable" | "closed" | "blocked" | "expired" | "not-completed" };

export type CardEvent =
  | { type: "press" }
  | { type: "minted"; sessionId: string }
  | { type: "submitted" }
  | { type: "polled" }
  | { type: "settled" }
  | { type: "not-completed" }
  | { type: "closed" }
  | { type: "blocked" }
  | { type: "unavailable" }
  | { type: "expired" }
  | { type: "reset" };

/** The browser's widget events only move the screen; the money is credited by the server from Circle's signed notification and the chain. A settled payment stays settled. */
export function cardReducer(state: CardState, event: CardEvent): CardState {
  if (state.step === "settled") return state;
  switch (event.type) {
    case "press":
      return state.step === "idle" || state.step === "failed" ? { step: "minting" } : state;
    case "minted":
      return state.step === "minting" ? { step: "widget", sessionId: event.sessionId } : state;
    case "submitted":
      return state.step === "widget" ? { step: "submitted", sessionId: state.sessionId } : state;
    case "polled":
      return state.step === "submitted" || state.step === "waiting" ? { step: "waiting", sessionId: state.sessionId } : state;
    case "settled":
      return { step: "settled" };
    case "not-completed":
    case "closed":
    case "blocked":
    case "unavailable":
    case "expired":
      return { step: "failed", reason: event.type };
    case "reset":
      return { step: "idle" };
  }
}
