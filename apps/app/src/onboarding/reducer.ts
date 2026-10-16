import { type Answers, type ErrorKey, type StepId, emptyAnswers, fingerprint, stepsFor, validate } from "./answers.ts";
import type { DiagnosisJson } from "./diagnosis-json.ts";

export type Phase = "questions" | "account" | "done";
export type AccountMode = "register" | "login";

export interface State {
  answers: Answers;
  step: StepId;
  phase: Phase;
  accountMode: AccountMode;
  errors: ErrorKey[];
  diagnosis: DiagnosisJson | null;
  status: "idle" | "loading" | "error";
}

export type Action =
  | { type: "set"; patch: Partial<Answers> }
  | { type: "next" }
  | { type: "back" }
  | { type: "diagnosis"; value: DiagnosisJson; fingerprint: string }
  | { type: "loading" }
  | { type: "failed"; fingerprint: string }
  | { type: "account"; mode?: AccountMode }
  | { type: "questions" }
  | { type: "done" };

const DEFAULT_DAYS = [5, 12, 20, 27];

export const initialState = (initial: Partial<Answers>, mode: AccountMode = "register"): State => ({
  answers: { ...emptyAnswers, ...initial },
  step: "profile",
  phase: mode === "login" ? "account" : "questions",
  accountMode: mode,
  errors: [],
  diagnosis: null,
  status: "idle",
});

export function reduce(state: State, action: Action): State {
  switch (action.type) {
    case "set": {
      const answers = { ...state.answers, ...action.patch };
      if (action.patch.paymentsPerMonth) answers.paymentDays = DEFAULT_DAYS.slice(0, action.patch.paymentsPerMonth);
      // a regime belongs to a country: a new country starts without one
      if (action.patch.country !== undefined && action.patch.country !== state.answers.country) answers.regime = null;
      return { ...state, answers, errors: [], diagnosis: null, status: "idle" };
    }
    case "next": {
      const errors = validate(state.step, state.answers);
      if (errors.length > 0) return { ...state, errors };
      const steps = stepsFor(state.answers);
      const next = steps[steps.indexOf(state.step) + 1];
      return next ? { ...state, step: next, errors: [] } : state;
    }
    case "back": {
      const steps = stepsFor(state.answers);
      const previous = steps[steps.indexOf(state.step) - 1];
      return previous ? { ...state, step: previous, errors: [] } : state;
    }
    // an answer that arrives for answers the user has since changed is dropped, never shown
    case "diagnosis":
      return action.fingerprint === fingerprint(state.answers) ? { ...state, diagnosis: action.value, status: "idle" } : state;
    case "loading":
      return { ...state, status: "loading" };
    case "failed":
      return action.fingerprint === fingerprint(state.answers) ? { ...state, status: "error" } : state;
    case "account": {
      const mode = action.mode ?? state.accountMode;
      if (mode === "register" && !(state.step === "review" && state.diagnosis)) return state;
      return { ...state, phase: "account", accountMode: mode, errors: [] };
    }
    case "questions":
      return { ...state, phase: "questions" };
    case "done":
      return { ...state, phase: "done" };
  }
}
