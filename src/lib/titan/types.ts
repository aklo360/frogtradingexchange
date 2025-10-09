export type QuoteRouter = {
  id: string;
  name: string;
  weightBps: number;
};

export type QuoteSnapshot = {
  status: "pending" | "executable" | "stale" | "error";
  updatedAt: string;
  inMint: string;
  outMint: string;
  amountIn: string;
  amountOut: string;
  priceImpactBps: number;
  routers: QuoteRouter[];
  routeId?: string;
  executable: boolean;
  simulated: boolean;
  error?: string;
};

export type SwapBuildRequest = {
  userPubkey: string;
  inMint: string;
  outMint: string;
  amountIn: string;
  slippageBps: number;
  priorityFee: number;
};

export type SwapBuildResponse =
  | {
      mode: "tx_base64";
      txBase64: string;
      meta?: Record<string, unknown>;
    }
  | {
      mode: "route";
      route: unknown;
      meta?: Record<string, unknown>;
    };
