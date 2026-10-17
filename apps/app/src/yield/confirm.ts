import type { Notice } from "@strickle/agent/notice-schema";
import type { EarnAction } from "./actions.ts";

/** A request is answered when the agent says it moved that box in that direction, or says why it could not; both are told in Activity. */
export function earnAnswered(opened: readonly { notice: Notice }[], action: EarnAction): boolean {
  return opened.some(({ notice }) => (notice.kind === "earn" && notice.box === action.box && notice.deposit === (action.kind === "invest")) || (notice.kind === "earn-held" && notice.box === action.box));
}
