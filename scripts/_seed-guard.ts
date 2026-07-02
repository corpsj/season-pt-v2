/**
 * 시드 오실행 가드(감사 #5): .env가 라이브 프로드를 가리키는 상태에서 시드를 돌리면
 * 파괴적 delete·가짜 매출·약한 비밀번호 계정이 실데이터에 섞인다. 프로드를 겨냥하면
 * ALLOW_PROD_SEED=1 명시 없이는 즉시 중단.
 */
const PROD_REF = "exdsrqjvjmakduufslif";

export function assertSeedTargetAllowed(url: string | undefined): void {
  if (!url) throw new Error("missing NEXT_PUBLIC_SUPABASE_URL");
  if (url.includes(PROD_REF) && process.env.ALLOW_PROD_SEED !== "1") {
    throw new Error(
      `이 시드는 라이브 프로드 DB(${PROD_REF})를 겨냥하고 있어요. 정말 실행하려면 ALLOW_PROD_SEED=1 bun run <script> 로 명시하세요.`,
    );
  }
}
