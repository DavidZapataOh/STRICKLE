import { sourceChainsFor } from "@strickle/arc/bridge/chains";
import { irisBase } from "@strickle/arc/bridge/iris";
import type { ArcNetworkName } from "@strickle/arc/networks";

export const depositConnectOrigins = (network: ArcNetworkName): string[] => [...new Set([new URL(irisBase(network)).origin, ...sourceChainsFor(network).flatMap((chain) => chain.rpc.map((url) => new URL(url).origin))])];
