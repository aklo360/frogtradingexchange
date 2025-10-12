import { ImageResponse } from "next/og";

// Serve the exact pixel frog as the favicon
export const size = { width: 88, height: 88 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      // Use the production asset to ensure the exact PNG is rendered
      // Note: Using an absolute URL avoids bundling issues in edge runtime
      <img
        src="https://frogtrading.exchange/sbficon.png"
        width={size.width}
        height={size.height}
        style={{ display: "block", imageRendering: "pixelated" }}
        alt="Frog favicon"
      />
    ),
    size,
  );
}
