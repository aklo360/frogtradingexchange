import { ImageResponse } from "next/og";

export const size = {
  width: 32,
  height: 32,
};

export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#050315",
        }}
      >
        <div
          style={{
            width: "72%",
            height: "72%",
            borderRadius: 6,
            background: "#14f195",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#050315",
            fontWeight: 900,
            fontSize: 20,
            letterSpacing: 1,
          }}
        >
          F
        </div>
      </div>
    ),
    size,
  );
}

