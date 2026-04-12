import path from "node:path";
import { fileURLToPath } from "node:url";

import type { NextConfig } from "next";

const workspaceRoot = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["better-sqlite3", "@anthropic-ai/claude-agent-sdk"],
  turbopack: {
    root: workspaceRoot,
  },
};

export default nextConfig;
