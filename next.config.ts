import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  ...(process.env.NCCS_DESKTOP_BUILD === "1" ? { output: "standalone" as const } : {}),
  async headers() {
    return [
      {
        source: "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
        headers: [
          { key: "Cache-Control", value: "private, no-cache, no-store, max-age=0, must-revalidate" },
        ],
      },
    ];
  },
};

export default nextConfig;
