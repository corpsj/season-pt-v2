import type { NextConfig } from "next";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const root = dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  // Pin the workspace root (a stray lockfile in $HOME otherwise misleads inference).
  turbopack: { root },
  outputFileTracingRoot: root,
};

export default nextConfig;
