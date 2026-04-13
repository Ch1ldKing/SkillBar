import path from "node:path";
import { fileURLToPath } from "node:url";

import type { NextConfig } from "next";

const workspaceRoot = path.dirname(fileURLToPath(import.meta.url));
const backendOrigin = process.env.SKILLBAR_BACKEND_ORIGIN?.trim();

function normalizeOrigin(value: string) {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["better-sqlite3", "@anthropic-ai/claude-agent-sdk"],
  turbopack: {
    root: workspaceRoot,
  },
  async rewrites() {
    if (!backendOrigin) {
      return [];
    }

    return {
      beforeFiles: [
        {
          destination: `${normalizeOrigin(backendOrigin)}/api/:path*`,
          source: "/api/:path*",
        },
      ],
    };
  },
};

export default nextConfig;
