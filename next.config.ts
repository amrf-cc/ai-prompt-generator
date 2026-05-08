import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["better-sqlite3", "pdf-parse", "sharp"],
  experimental: {
    proxyClientMaxBodySize: "100mb",
  },
  async headers() {
    return [
      {
        source: "/api/:path*",
        headers: [
          { key: "X-Accel-Buffering", value: "no" },
        ],
      },
    ];
  },
};

export default nextConfig;
