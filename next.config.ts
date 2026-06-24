import type { NextConfig } from "next";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const root = dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  // Pin the workspace root (a stray lockfile in $HOME otherwise misleads inference).
  turbopack: { root },
  outputFileTracingRoot: root,
  experimental: {
    // Client Router Cache: keep prefetched/visited segments so switching back to a
    // recently-viewed tab is instant. dynamic default is 0 (refetch every nav) — the
    // main cause of the ~760ms tab-switch delay. Tabs are dynamic (auth/cookies), so
    // `dynamic` governs them; `static` covers prefetch={true} routes (5min).
    staleTimes: { dynamic: 60, static: 300 },
  },
};

export default nextConfig;
