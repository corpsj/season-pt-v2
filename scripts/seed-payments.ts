/**
 * Backfill payment history (additive · idempotent).
 *
 * The 0001 seed creates memberships but no `payments` rows, so the member
 * 결제·구매 내역 (/m/my/payments) screen would be empty. This inserts ONE card
 * payment per membership that has none — amount = membership.price,
 * paid_at = membership.start_date. Memberships with a null price (e.g. 2:1
 * shared plans) or that already have a payment are skipped, so re-running is a
 * no-op. Backfilled rows are dated at the membership start (months in the
 * past), so they fall outside the trainer dashboard's current-month revenue
 * window and don't affect it.
 *
 * Run:  bun run scripts/seed-payments.ts
 */
import { createClient } from "@supabase/supabase-js";
import { assertSeedTargetAllowed } from "./_seed-guard";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) throw new Error("missing supabase env (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)");
assertSeedTargetAllowed(url); // 프로드 오실행 가드(감사 #5)

const db = createClient(url, serviceKey, { auth: { persistSession: false } });

async function main() {
  const { data: memberships, error: msErr } = await db
    .from("memberships")
    .select("id, price, start_date, status");
  if (msErr) throw msErr;

  const { data: existing, error: payErr } = await db.from("payments").select("membership_id");
  if (payErr) throw payErr;
  const have = new Set((existing ?? []).map((p) => p.membership_id));

  const toInsert = (memberships ?? [])
    .filter((m) => !have.has(m.id) && typeof m.price === "number" && m.price > 0)
    .map((m) => ({
      membership_id: m.id,
      method: "card" as const,
      amount: m.price as number,
      paid_at: m.start_date as string,
    }));

  if (!toInsert.length) {
    console.log("payments backfill: nothing to insert — every priced membership already has a payment.");
    return;
  }

  const { data: inserted, error: insErr } = await db.from("payments").insert(toInsert).select("id");
  if (insErr) throw insErr;
  console.log(`payments backfill: inserted ${inserted?.length ?? 0} payment row(s) across ${memberships?.length ?? 0} membership(s).`);
}

main().catch((e) => {
  console.error("BACKFILL FAILED:", e);
  process.exit(1);
});
