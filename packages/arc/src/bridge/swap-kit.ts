import { SwapKit } from "@circle-fin/swap-kit";

export type DepositSwapKit = SwapKit;

/** Keyless on purpose: an API key is a server secret and the quote runs in the user's browser. */
export const createDepositSwapKit = (): DepositSwapKit => new SwapKit();
