import { NextResponse } from "next/server";
import { postSwapBuild } from "@/lib/titan/client";
import { serviceConfig } from "@/lib/config";
import type { SwapBuildRequest } from "@/lib/titan/types";

export async function POST(request: Request) {
  const payload = (await request.json()) as SwapBuildRequest;

  if (!serviceConfig.titanToken) {
    return NextResponse.json(
      {
        mode: "tx_base64",
        txBase64: "BASE64_TX_PLACEHOLDER",
        meta: {
          mock: true,
          message: "Titan token missing; returning sample transaction.",
        },
      },
      { status: 200 },
    );
  }

  try {
    const result = await postSwapBuild(payload);
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    console.error("Failed to build Titan swap", error);
    return NextResponse.json(
      { error: "Swap builder unavailable" },
      { status: 502 },
    );
  }
}
