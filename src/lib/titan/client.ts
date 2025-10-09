import "server-only";

import { assertServerSide, serviceConfig } from "../config";
import type {
  QuoteSnapshot,
  SwapBuildRequest,
  SwapBuildResponse,
} from "./types";

const JSON_HEADERS = {
  "Content-Type": "application/json",
  Authorization: `Bearer ${serviceConfig.titanToken}`,
};

type TitanFetchOptions = {
  path: string;
  init?: RequestInit;
};

const titanFetch = async <T>({ path, init }: TitanFetchOptions): Promise<T> => {
  assertServerSide();

  const url = `${serviceConfig.titanBaseUrl}${path}`;
  const response = await fetch(url, {
    ...init,
    headers: {
      ...JSON_HEADERS,
      ...init?.headers,
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `Titan request failed (${response.status} ${response.statusText}): ${body}`,
    );
  }

  return response.json() as Promise<T>;
};

export const fetchFrogxInfo = () =>
  titanFetch<{ routers: string[] }>({ path: "/frogx/info" });

export const postSwapQuote = (payload: {
  inMint: string;
  outMint: string;
  amountIn: string;
  slippageBps: number;
  priorityFee: number;
}) =>
  titanFetch<QuoteSnapshot>({
    path: "/frogx/quotes",
    init: {
      method: "POST",
      body: JSON.stringify(payload),
    },
  });

export const postSwapBuild = (payload: SwapBuildRequest) =>
  titanFetch<SwapBuildResponse>({
    path: "/frogx/swap",
    init: {
      method: "POST",
      body: JSON.stringify(payload),
    },
  });
