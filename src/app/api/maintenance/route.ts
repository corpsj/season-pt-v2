import { runStudioMaintenance } from "@/lib/data/groups/maintenance";
import { scanExpiringMemberships } from "@/lib/data/groups/notifications";
import { authorizeCronRequest } from "@/lib/auth/cron-auth";

/**
 * Vercel Cron 진입점(vercel.json crons — 매일 05:00 KST). 유지보수가 대시보드 로드에만
 * 걸려 있으면 아무도 안 여는 날 만료 전이·세션 생성·만료 임박 알림이 멈춘다(감사 #45).
 * 모든 쓰기 전에 CRON_SECRET을 fail-closed로 검증한다.
 */
export async function GET(req: Request) {
  const auth = authorizeCronRequest(
    process.env.CRON_SECRET,
    req.headers.get("authorization"),
  );
  if (!auth.ok) {
    return new Response(auth.message, { status: auth.status });
  }

  await runStudioMaintenance();
  const scanned = await scanExpiringMemberships().catch((e) => {
    console.error("[maintenance] scanExpiringMemberships:", e);
    return { created: 0 };
  });
  return Response.json({ ok: true, expiringCreated: scanned.created });
}
