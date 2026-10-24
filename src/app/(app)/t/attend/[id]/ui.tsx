"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Body, Footer } from "@/components/shell/Body";
import { BackButton } from "@/components/shell/BackButton";
import { Card } from "@/components/ui/Card";
import { Kicker } from "@/components/ui/Kicker";
import { Banner } from "@/components/ui/Banner";
import { Avatar, TeamAvatar } from "@/components/ui/Avatar";
import { Icon } from "@/components/ui/icon";
import { RadioOption } from "@/components/ui/RadioOption";
import { PrimaryButton } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { SignaturePad } from "@/components/ui/SignaturePad";
import { useToast } from "@/components/ui/Toast";
import { confirmAttendance } from "@/lib/data/groups/scheduling-actions";
import { shouldDeduct } from "@/lib/data/deduction";
import type { AttendTarget, StudioSettings } from "@/lib/types";

type Method = "attend" | "noshow" | "cancel";

export default function AttendClient({ target: t, settings }: { target: AttendTarget; settings: StudioSettings }) {
  const router = useRouter();
  const toast = useToast();
  const [method, setMethod] = useState<Method>("attend");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [signature, setSignature] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const operationId = useRef<string>("");
  const [allowFree, setAllowFree] = useState(false);
  const needSign = method === "attend" && !signature;

  const deducted = shouldDeduct(method, t.scheduledAt, settings);
  // 라디오 옵션별 실제 차감 여부 — '취소 (미차감)' 고정 라벨이 컷오프 이내 취소의 실제 차감과 모순되던 문제(감사 medium).
  const noshowDeducts = shouldDeduct("noshow", t.scheduledAt, settings);
  const cancelDeducts = shouldDeduct("cancel", t.scheduledAt, settings);
  const after = deducted ? Math.max(0, t.remaining - 1) : t.remaining;
  const cta = method === "cancel" ? "수업 취소 기록" : "출석 처리하기";
  const confirmTitle =
    method === "cancel" ? "수업 취소를 기록할까요?" : method === "noshow" ? "노쇼로 처리할까요?" : "출석 처리할까요?";
  const confirmDesc = deducted
    ? `잔여 ${t.remaining}회 → ${after}회로 차감돼요.`
    : "차감 없이 기록만 남겨요.";

  return (
    <div className="scr flex min-h-0 flex-1 flex-col">
      <Body>
        {/* header */}
        <div className="mb-5 flex items-center gap-3">
          <BackButton />
          <span className="text-[19px] font-bold text-ink">출석 체크</span>
        </div>

        {/* target */}
        <Card className="flex items-center gap-3.5 p-5">
          {t.isTeam && t.team ? <TeamAvatar team={t.team} size={54} /> : <Avatar initial={t.initial} tone={t.avatarTone} size={54} />}
          <div className="min-w-0">
            <div className="text-[17px] font-bold text-ink">{t.name}</div>
            <div className="text-[13px] text-muted2">{t.meta}</div>
          </div>
        </Card>

        {t.isTeam ? (
          <Banner tone="team" className="mt-3.5">
            2:1 팀은 함께 출석·차감돼요. 한 분만 따로 처리할 수 없어요.
          </Banner>
        ) : null}

        <div className="mb-2.5 mt-5">
          <Kicker>처리 방식</Kicker>
        </div>

        <div className="flex flex-col gap-2.5">
          <RadioOption
            selected={method === "attend"}
            onClick={() => setMethod("attend")}
            right={<span className="text-[12.5px] font-semibold text-sage-deep">기본</span>}
          >
            <span className="text-[14px] font-bold text-ink">{t.isTeam ? "팀 출석" : "출석"}</span>
          </RadioOption>
          <RadioOption selected={method === "noshow"} onClick={() => setMethod("noshow")}>
            <span className="text-[14px] font-bold text-ink">{t.isTeam ? "팀 노쇼" : "노쇼"}</span>
            <span className="text-[14px] font-medium text-muted2">{noshowDeducts ? " (차감)" : " (미차감)"}</span>
          </RadioOption>
          <RadioOption selected={method === "cancel"} onClick={() => setMethod("cancel")}>
            <span className="text-[14px] font-bold text-ink">수업 취소</span>
            <span className="text-[14px] font-medium text-muted2">{cancelDeducts ? " (차감)" : " (미차감)"}</span>
          </RadioOption>
        </div>

        {/* remaining — 2:1은 회원별로 표기(파트너 잔여 0이 경고 없이 무료 수업 되던 문제, 감사 #25) */}
        {t.isTeam && t.balances.length >= 2 ? (
          <Card className="mt-3.5 flex flex-col gap-2.5 px-[15px] py-[13px]">
            {t.balances.map((b) => (
              <div key={b.name} className="flex items-center gap-3">
                <Icon name="ticket-fill" size={18} className="flex-none text-sage-deep" />
                <span className="flex-1 text-[13.5px] font-medium text-ink-soft">
                  {b.name} {deducted ? "차감 후 잔여" : "잔여"}
                </span>
                <span className="serif text-[18px] font-bold text-ink">{b.remaining}</span>
                {deducted && <Icon name="arrow-right" size={16} className="flex-none text-chevron" />}
                {deducted && (
                  <span className="serif text-[18px] font-bold text-terracotta">{Math.max(0, b.remaining - 1)}</span>
                )}
              </div>
            ))}
          </Card>
        ) : (
          <Card className="mt-3.5 flex items-center gap-3 px-[15px] py-[13px]">
            <Icon name="ticket-fill" size={18} className="flex-none text-sage-deep" />
            <span className="flex-1 text-[13.5px] font-medium text-ink-soft">{deducted ? "차감 후 잔여" : "잔여 (차감 없음)"}</span>
            <span className="serif text-[18px] font-bold text-ink">{t.remaining}</span>
            {deducted && <Icon name="arrow-right" size={16} className="flex-none text-chevron" />}
            {deducted && <span className="serif text-[18px] font-bold text-terracotta">{after}</span>}
          </Card>
        )}

        {(() => {
          const zeros = deducted
            ? (t.balances.length ? t.balances : [{ name: t.name, remaining: t.remaining }]).filter((b) => b.remaining <= 0)
            : [];
          return zeros.length ? (
            <Banner tone="warn" className="mt-3.5">
              {t.isTeam ? `${zeros.map((z) => z.name).join(", ")}님은 ` : ""}잔여 회차가 없어요. 이대로 처리하면 무료
              수업으로 남아요 — 재등록(결제)을 먼저 확인하세요.
            </Banner>
          ) : null;
        })()}

        {t.balances.some((b) => b.remaining <= 0) ? <label className="mt-3 flex min-h-12 items-center gap-2 text-sm"><input type="checkbox" checked={allowFree} onChange={(e) => setAllowFree(e.target.checked)} />회차가 없는 회원은 무료 수업으로 기록</label> : null}
        {/* 수업 완료 회원 확인 서명 — 출석일 때만(노쇼·취소는 회원 부재) */}
        {method === "attend" ? (
          <>
            <div className="mb-2.5 mt-5">
              <Kicker>회원 확인 서명</Kicker>
            </div>
            <SignaturePad onChange={setSignature} />
            <p className="mt-2 px-0.5 text-[12px] font-medium text-muted3">
              수업 완료 확인을 위해 회원이 직접 서명해주세요{t.isTeam ? " (팀은 한 분이 대표로 서명)" : ""}.
            </p>
          </>
        ) : null}
      </Body>

      <Footer>
        <PrimaryButton icon="check-bold" pending={busy} disabled={needSign} onClick={() => setConfirmOpen(true)}>
          {cta}
        </PrimaryButton>
        <p className="mt-2.5 text-center text-[12px] font-medium text-muted3">
          {needSign ? "회원 서명을 받아야 출석 처리할 수 있어요" : "모든 차감·정정은 이력에 자동 기록돼요"}
        </p>
      </Footer>

      <ConfirmDialog
        open={confirmOpen}
        title={confirmTitle}
        description={confirmDesc}
        confirmLabel="확인"
        onConfirm={async () => {
          if (busy) return;
          setConfirmOpen(false);
          setBusy(true);
          operationId.current ||= crypto.randomUUID();
          let r;
          try { r = await confirmAttendance(t.sessionId, method, method === "attend" ? signature ?? undefined : undefined, { operationId: operationId.current, expectedVersion: t.attendanceVersion, allowFree }); }
          catch { setBusy(false); toast("처리 결과를 확인하지 못했어요. 같은 요청으로 다시 시도해주세요.", "error"); return; }
          setBusy(false);
          if (!r.ok) {
            toast(r.error ?? "처리에 실패했어요", "error");
            return;
          }
          toast(method === "cancel" ? "수업 취소를 기록했어요" : method === "noshow" ? "노쇼로 처리했어요" : "출석을 기록했어요");
          router.back();
          router.refresh();
        }}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
}
