import { NextResponse } from "next/server";
import { postSwapQuote } from "@/lib/titan/client";
import { serviceConfig } from "@/lib/config";

type QuoteRequest = {
  inMint: string;
  outMint: string;
  amountIn: string;
  slippageBps: number;
  priorityFee: number;
};

export async function POST(request: Request) {
  const payload = (await request.json()) as QuoteRequest;

  if (!serviceConfig.titanToken) {
    return NextResponse.json(
      {
        status: "executable",
        updatedAt: new Date().toISOString(),
        inMint: payload.inMint,
        outMint: payload.outMint,
        amountIn: payload.amountIn,
        slippageBps: payload.slippageBps,
        amountOut: "980000",
        priceImpactBps: 12,
        routers: [
          { id: "titan", name: "Titan Direct", weightBps: 6500 },
          { id: "jup", name: "Jupiter", weightBps: 3500 },
        ],
        routeId: "demo-route-123",
        executable: true,
        simulated: true,
      },
      { status: 200 },
    );
  }

  try {
    const quote = await postSwapQuote(payload);
    return NextResponse.json(quote, { status: 200 });
  } catch (error) {
    console.error("Failed to fetch Titan quote", error);
    return NextResponse.json(
      { error: "Quote stream unavailable" },
      { status: 502 },
    );
  }
}
