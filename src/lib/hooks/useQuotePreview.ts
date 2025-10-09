"use client";

import { useEffect, useState } from "react";

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

type QuotePreviewResponse = {
  amountOut: string;
  priceImpactBps: number;
  routers: Array<{ id?: string; name?: string } | string>;
  executable: boolean;
  updatedAt: string;
};

type QuotePreview = {
  amountOut: string;
  priceImpactBps: number;
  routers: string[];
  executable: boolean;
  updatedAt: string;
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
        const response = await fetch("/api/frogx/quotes", {
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
