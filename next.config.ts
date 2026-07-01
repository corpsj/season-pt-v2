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
    // 인바디 PDF 업로드(최대 10MB)를 서버 액션으로 받기 위해 상향. 기본값(1MB)은 부족.
    serverActions: { bodySizeLimit: "11mb" },
  },
};

export default nextConfig;
