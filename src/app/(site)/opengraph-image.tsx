import { ImageResponse } from "next/og";

export const alt = "NCCS Gilgit — National College of Commerce and Computer Science";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "flex-end",
          background: "#0C1B33",
          color: "#F6F3EE",
          padding: "72px",
        }}
      >
        <div style={{ fontSize: 22, letterSpacing: 4, color: "#E6D2A8" }}>NCCS GILGIT · EST. 2018</div>
        <div style={{ fontSize: 64, lineHeight: 1.05, marginTop: 18, letterSpacing: -1.5, maxWidth: 920 }}>
          National College of Commerce and Computer Science
        </div>
        <div style={{ fontSize: 28, marginTop: 22, color: "#D5DCE4" }}>Gilgit, Gilgit-Baltistan</div>
      </div>
    ),
    { ...size },
  );
}
