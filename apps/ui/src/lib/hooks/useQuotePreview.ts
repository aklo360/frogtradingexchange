"use client";

import { useEffect, useState } from "react";
import { buildApiUrl } from "@/lib/api";

type QuotePreviewParams = {
  inMint: string;
  outMint: string;
  amountIn: string;
  slippageBps: number;
  priorityFee: number;
  userPublicKey?: string;
  enabled?: boolean;
};

type QuotePreviewState<T> =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; data: T }
  | { status: "error"; error: string };

type QuoteInstructionAccount = {
  pubkey: string;
  isSigner: boolean;
  isWritable: boolean;
};

type QuoteInstruction = {
  programId: string;
  accounts: QuoteInstructionAccount[];
  data: string;
};

type QuotePlatformFee = {
  mint: string;
  amount: string;
  feeBps: number;
  direction: "input" | "output";
};

type QuotePreviewResponse = {
  amountOut: string;
  priceImpactBps: number;
  routers: Array<{ id?: string; name?: string } | string>;
  executable: boolean;
  updatedAt: string;
  provider?: string;
  routeId?: string;
  transactionBase64?: string;
  inAmount?: string;
  instructions?: QuoteInstruction[];
  addressLookupTables?: string[];
  computeUnits?: number;
  computeUnitsSafe?: number;
  platformFee?: QuotePlatformFee;
};

type QuotePreview = {
  amountOut: string;
  priceImpactBps: number;
  routers: string[];
  executable: boolean;
  updatedAt: string;
  provider?: string;
  routeId?: string;
  transactionBase64?: string;
  inAmount?: string;
  instructions?: QuoteInstruction[];
  addressLookupTables?: string[];
  computeUnits?: number;
  computeUnitsSafe?: number;
  platformFee?: QuotePlatformFee;
};

export const useQuotePreview = (params: QuotePreviewParams) => {
  const [state, setState] = useState<QuotePreviewState<QuotePreview>>({
    status: "idle",
  });

  const {
    inMint,
    outMint,
    amountIn,
    slippageBps,
    priorityFee,
    userPublicKey,
    enabled = true,
  } = params;

  useEffect(() => {
    const controller = new AbortController();

    if (!enabled || amountIn === "0" || !userPublicKey) {
      setState({ status: "idle" });
      return () => controller.abort();
    }

    const requestQuote = async () => {
      setState({ status: "loading" });

      try {
        const response = await fetch(buildApiUrl("/api/frogx/quotes"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            inMint,
            outMint,
            amountIn,
            slippageBps,
            priorityFee,
            userPublicKey,
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(`Failed with status ${response.status}`);
        }

        const raw = (await response.json()) as QuotePreviewResponse;
        const routers = raw.routers.map((router) =>
          typeof router === "string"
            ? router
            : router.name ?? router.id ?? "unknown-router",
        );

        setState({
          status: "success",
          data: {
            amountOut: raw.amountOut,
            priceImpactBps: raw.priceImpactBps,
            routers,
            executable: raw.executable,
            updatedAt: raw.updatedAt,
            provider: raw.provider,
            routeId: raw.routeId,
            transactionBase64: raw.transactionBase64,
            inAmount: raw.inAmount,
            instructions: raw.instructions ?? [],
            addressLookupTables: raw.addressLookupTables ?? [],
            computeUnits: raw.computeUnits,
            computeUnitsSafe: raw.computeUnitsSafe,
            platformFee: raw.platformFee,
          },
        });
      } catch (error) {
        if ((error as Error).name === "AbortError") {
          return;
        }

        setState({
          status: "error",
          error: (error as Error).message ?? "Unknown error",
        });
      }
    };

    requestQuote();

    return () => controller.abort();
  }, [amountIn, enabled, inMint, outMint, priorityFee, slippageBps, userPublicKey]);

  return state;
};
