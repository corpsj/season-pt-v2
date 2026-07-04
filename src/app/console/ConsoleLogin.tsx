"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/icon";
import { trainerLogin, trainerLogout } from "@/lib/auth/trainer-actions";

/**
 * Desktop owner-console login. Single simple form (아이디 · 비밀번호 · 로그인) — no
 * member/trainer role split (PC console is admin-only). Rendered by the console layout
 * whenever there's no owner session, so /console is the single PC entry point.
 */
export function ConsoleLogin({ notOwner, showOwnerSignup }: { notOwner: boolean; showOwnerSignup?: boolean }) {
  const router = useRouter();
  const [id, setId] = useState("");
  const [pw, setPw] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function submit() {
    if (pending) return;
    setErr(null);
    start(async () => {
      const r = await trainerLogin(id.trim(), pw);
      if (r.ok && r.mustChangePassword) {
        router.push("/set-password");
      } else if (r.ok) {
        router.refresh();
      } else {
        setErr(r.error ?? "로그인에 실패했어요");
      }
    });
  }

  function logout() {
    start(async () => {
      await trainerLogout();
      router.refresh();
    });
  }

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-frame px-6">
      <div className="w-full max-w-[380px]">
        <div className="mb-7 flex flex-col items-center text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/icon-192.png" alt="계절 PT" width={56} height={56} className="mb-4 rounded-[14px]" />
          <div className="text-[20px] font-bold tracking-[-0.01em] text-surface">계절 PT &amp; 필라테스</div>
          <div className="mt-1 text-[13px] font-medium text-[#9B8F7C]">운영 콘솔</div>
        </div>

        <div className="rounded-[20px] bg-white p-7" style={{ boxShadow: "0 24px 60px -20px rgba(0,0,0,0.5)" }}>
          {notOwner ? (
            <div className="text-center">
              <div className="mx-auto mb-4 flex h-[52px] w-[52px] items-center justify-center rounded-[15px] bg-[#FBF3E9]"><Icon name="lock-fill" size={24} className="text-terracotta" /></div>
              <div className="text-[16px] font-bold text-ink">대표 전용 콘솔이에요</div>
              <div className="mt-1.5 text-[13px] font-medium leading-relaxed text-[#9A917F]">지금 로그인한 계정은 대표 권한이 없어요. 대표 계정으로 다시 로그인해 주세요.</div>
              <button onClick={logout} disabled={pending} className="mt-5 w-full rounded-[12px] bg-sage py-[13px] text-[14px] font-semibold text-white transition hover:brightness-105 active:scale-[.99] disabled:opacity-50">다른 계정으로 로그인</button>
            </div>
          ) : (
            <>
              <label className="mb-1.5 block text-[12px] font-semibold text-[#766D60]">아이디</label>
              <input
                value={id}
                onChange={(e) => setId(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") document.getElementById("console-pw")?.focus(); }}
                autoFocus
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                autoComplete="username"
                placeholder="아이디"
                className="mb-3.5 w-full rounded-[12px] border border-[rgba(75,59,46,0.14)] bg-[#FBF9F5] px-[15px] py-[13px] text-[14px] font-medium text-ink outline-none transition focus:border-sage placeholder:text-[#B3AA9C]"
              />
              <label className="mb-1.5 block text-[12px] font-semibold text-[#766D60]">비밀번호</label>
              <input
                id="console-pw"
                type="password"
                value={pw}
                onChange={(e) => setPw(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
                autoComplete="current-password"
                placeholder="비밀번호"
                className="w-full rounded-[12px] border border-[rgba(75,59,46,0.14)] bg-[#FBF9F5] px-[15px] py-[13px] text-[14px] font-medium text-ink outline-none transition focus:border-sage placeholder:text-[#B3AA9C]"
              />
              {err ? <div className="mt-3 text-[12.5px] font-medium text-terracotta">{err}</div> : null}
              <button
                onClick={submit}
                disabled={pending || !id.trim() || !pw}
                className="mt-5 flex w-full items-center justify-center gap-2 rounded-[12px] bg-sage py-[13px] text-[14.5px] font-semibold text-white transition hover:brightness-105 active:scale-[.99] disabled:opacity-50"
              >
                {pending ? "로그인 중…" : <>로그인<Icon name="login" size={16} /></>}
              </button>
              {showOwnerSignup ? (
                <Link
                  href="/signup/owner"
                  className="mt-3 flex items-center justify-center gap-2 rounded-[12px] border border-gold/40 bg-gold-bg py-[12px] text-[13.5px] font-semibold text-gold transition hover:brightness-[0.98] active:scale-[.99]"
                >
                  <Icon name="crown-fill" size={16} className="text-gold" />
                  대표 회원가입 (최초 1회)
                </Link>
              ) : null}
            </>
          )}
        </div>

        <div className="mt-5 text-center text-[12px] font-medium text-[#6F6655]">계절 PT 운영 콘솔</div>
      </div>
    </div>
  );
}
