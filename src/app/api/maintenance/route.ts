import { runStudioMaintenance } from "@/lib/data/groups/maintenance";
import { scanExpiringMemberships } from "@/lib/data/groups/notifications";

/**
 * Vercel Cron 진입점(vercel.json crons — 매일 05:00 KST). 유지보수가 대시보드 로드에만
 * 걸려 있으면 아무도 안 여는 날 만료 전이·세션 생성·만료 임박 알림이 멈춘다(감사 #45).
 * 멱등이라 수동 호출도 무해하지만 CRON_SECRET 설정 시 검증한다.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("unauthorized", { status: 401 });
  }
  await runStudioMaintenance();
  const scanned = await scanExpiringMemberships().catch((e) => {
    console.error("[maintenance] scanExpiringMemberships:", e);
    return { created: 0 };
  });
  return Response.json({ ok: true, expiringCreated: scanned.created });
}
