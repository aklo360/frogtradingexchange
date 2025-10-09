import { NextResponse } from "next/server";
import { fetchFrogxInfo } from "@/lib/titan/client";
import { serviceConfig } from "@/lib/config";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    if (!serviceConfig.titanToken) {
      return NextResponse.json(
        {
          routers: ["Titan Direct", "Jupiter"],
          preferredRegions: serviceConfig.preferredRegions,
          mock: true,
        },
        { status: 200 },
      );
    }

    const info = await fetchFrogxInfo();
    return NextResponse.json(
      {
        ...info,
        preferredRegions: serviceConfig.preferredRegions,
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("Failed to fetch Titan info", error);
    return NextResponse.json(
      {
        error: "Failed to reach Titan info endpoint",
      },
      { status: 502 },
    );
  }
}
