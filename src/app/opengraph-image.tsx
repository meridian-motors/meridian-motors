import { ImageResponse } from "next/og";

export const alt = "Meridian Motors — A smarter way to buy and sell cars";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OgImage() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", background: "#0D0F10", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 80, color: "white" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 30, letterSpacing: 8 }}>MERIDIAN <span style={{ color: "#A88C63" }}>MOTORS</span></div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 76, fontWeight: 600, lineHeight: 1.05, letterSpacing: -2 }}>A smarter way to buy and sell cars.</div>
          <div style={{ marginTop: 28, fontSize: 28, color: "rgba(255,255,255,0.6)" }}>Premium Automotive Marketplace · United Kingdom</div>
        </div>
        <div style={{ height: 2, background: "linear-gradient(90deg, rgba(168,140,99,0), #A88C63, rgba(168,140,99,0))" }} />
      </div>
    ),
    size,
  );
}
