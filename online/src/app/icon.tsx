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
          alignItems: "center",
          background: "linear-gradient(180deg, #fef3c7 0%, #fde68a 100%)",
          borderRadius: "9999px",
          display: "flex",
          height: "100%",
          justifyContent: "center",
          width: "100%",
        }}
      >
        <span
          style={{
            fontSize: 24,
            lineHeight: 1,
          }}
        >
          {"🍺"}
        </span>
      </div>
    ),
    {
      ...size,
      emoji: "twemoji",
    },
  );
}
