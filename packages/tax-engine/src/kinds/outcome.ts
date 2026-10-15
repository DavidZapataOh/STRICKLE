export type OutOfRegime = { status: "out-of-regime"; reason: string };
export type Ok<T> = { status: "ok" } & T;
export type Outcome<T> = Ok<T> | OutOfRegime;
