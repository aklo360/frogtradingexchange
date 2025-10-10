import fs from "node:fs";
import path from "node:path";
import { config as loadEnvConfig } from "dotenv";
import type { NextConfig } from "next";

const loadRootEnv = () => {
  const env = process.env.NODE_ENV ?? "development";
  const rootDir = path.resolve(__dirname, "..", "..");
  const candidates: Array<{ path: string; override: boolean }> = [
    { path: path.join(rootDir, ".env"), override: false },
    { path: path.join(rootDir, `.env.${env}`), override: false },
    { path: path.join(rootDir, ".env.local"), override: true },
    { path: path.join(rootDir, `.env.${env}.local`), override: true },
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate.path)) {
      loadEnvConfig({
        path: candidate.path,
        override: candidate.override,
      });
    }
  }
};

loadRootEnv();

const isDev = process.env.NODE_ENV !== "production";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async rewrites() {
    if (!isDev) return [];
    return [
      {
        source: "/api/:path*",
        destination: "http://localhost:8787/api/:path*",
      },
      {
        source: "/rpc",
        destination: "http://localhost:8787/rpc",
      },
    ];
  },
};

export default nextConfig;
