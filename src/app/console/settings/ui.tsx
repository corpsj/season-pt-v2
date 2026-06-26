"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/icon";
import { Switch } from "@/components/ui/Switch";
import { useToast } from "@/components/ui/Toast";
import { Card, PBtn, OBtn, GBtn, ConsoleModal, won } from "@/components/console/ui";
import { PrivacyToggle } from "@/components/console/privacy";
import { createProduct, updateProduct, setProductActive, updatePolicy, updateNotifications } from "@/lib/data/groups/owner-ops-actions";
import type { MembershipProduct, StudioSettings } from "@/lib/types";

type Draft = { id?: string; name: string; sessions: string; price: string; unitListPrice: string; durationDays: string };
const EMPTY: Draft = { name: "", sessions: "", price: "", unitListPrice: "", durationDays: "60" };

export function SettingsClient({ products, settings }: { products: MembershipProduct[]; settings: StudioSettings }) {
  const router = useRouter();
  const toast = useToast();
  const [edit, setEdit] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);

  const [noshow, setNoshow] = useState(settings.noshowDeducts);
  const [cutoff, setCutoff] = useState(settings.cancelCutoffHours);
  const [nExpiry, setNExpiry] = useState(settings.notifExpiry);
  const [nSession, setNSession] = useState(settings.notifSession);
  const [nPayment, setNPayment] = useState(settings.notifPayment);

  async function savePolicy(next: { noshowDeducts: boolean; cancelCutoffHours: number }) {
    const r = await updatePolicy(next);
    if (!r.ok) toast(r.error ?? "저장에 실패했어요");
  }
  async function saveNotif(next: { notifExpiry: boolean; notifSession: boolean; notifPayment: boolean }) {
    const r = await updateNotifications(next);
    if (!r.ok) toast(r.error ?? "저장에 실패했어요");
  }
  async function toggleProduct(p: MembershipProduct) {
    const r = await setProductActive(p.id, !p.active);
    if (!r.ok) return toast(r.error ?? "변경에 실패했어요");
    router.refresh();
  }
  async function saveProduct() {
    if (!edit) return;
    const n = edit.name.trim();
    const sessions = Number(edit.sessions);
    const price = Number(edit.price.replace(/[^\d]/g, ""));
    const dur = Number(edit.durationDays) || 60;
    const unit = Number(edit.unitListPrice.replace(/[^\d]/g, "")) || (sessions > 0 ? Math.round(price / sessions) : 0);
    if (!n || !sessions || !price) return toast("상품명·횟수·가격을 입력해주세요");
    setBusy(true);
    const r = edit.id
      ? await updateProduct(edit.id, { name: n, sessions, price, unitListPrice: unit, durationDays: dur })
      : await createProduct({ name: n, sessions, price, unitListPrice: unit, durationDays: dur });
    setBusy(false);
    if (!r.ok) return toast(r.error ?? "저장에 실패했어요");
    toast(edit.id ? "상품을 수정했어요" : "상품을 추가했어요");
    setEdit(null);
    router.refresh();
  }

  return (
    <>
      {/* products */}
      <Card className="mb-[18px] px-6 py-[22px]">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <div className="text-[16px] font-bold text-ink">회원권 상품</div>
            <div className="mt-0.5 text-[12px] font-medium text-[#9A917F]">발급 시 선택되는 상품 카탈로그</div>
          </div>
          <GBtn icon="plus-bold" onClick={() => setEdit({ ...EMPTY })}>상품 추가</GBtn>
        </div>
        <div className="flex flex-col gap-2.5">
          {products.map((p) => (
            <div key={p.id} className="flex items-center gap-3.5 rounded-[14px] border border-[rgba(75,59,46,0.06)] bg-[#FBF7F1] px-[17px] py-[15px]" style={{ opacity: p.active ? 1 : 0.6 }}>
              <div className="flex h-[42px] w-[42px] flex-none items-center justify-center rounded-[11px] bg-[#EDF4E3]"><Icon name="ticket-fill" size={19} className="text-sage-deep" /></div>
              <div className="flex-1">
                <div className="text-[14.5px] font-bold text-ink">{p.name}</div>
                <div className="mt-0.5 text-[11.5px] font-medium text-[#9A917F]">{p.sessions}회 · 유효 {p.durationDays}일{p.sessions > 0 ? ` · 회당 ${won(Math.round(p.price / p.sessions))}` : ""}</div>
              </div>
              <span className="serif text-[21px] font-semibold text-ink">{won(p.price)}</span>
              <Switch on={p.active} onChange={() => toggleProduct(p)} />
              <button onClick={() => setEdit({ id: p.id, name: p.name, sessions: String(p.sessions), price: String(p.price), unitListPrice: String(p.unitListPrice), durationDays: String(p.durationDays) })} className="flex h-[34px] w-[34px] items-center justify-center rounded-[10px] border border-[rgba(75,59,46,0.1)] bg-white text-[#9A917F] transition hover:bg-[#F4F0E8]"><Icon name="pencil" size={15} /></button>
            </div>
          ))}
          {products.length === 0 ? <div className="py-6 text-center text-[13px] font-medium text-[#A89F92]">등록된 상품이 없어요</div> : null}
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-[18px]">
        {/* policy */}
        <Card className="px-6 py-[22px]">
          <div className="text-[16px] font-bold text-ink">노쇼 · 취소 정책</div>
          <div className="mb-4 mt-1 text-[12px] font-medium text-[#9A917F]">차감 규칙과 취소 가능 시간</div>
          <div className="flex items-center gap-3 rounded-[13px] bg-[#FBF7F1] px-4 py-3.5">
            <Icon name="triangle-exclamation" size={18} className="text-terracotta" />
            <div className="flex-1"><div className="text-[13px] font-semibold text-ink">노쇼 시 1회 차감</div><div className="mt-px text-[11px] font-medium text-[#9A917F]">미출석 회원 잔여 횟수 차감</div></div>
            <Switch on={noshow} onChange={(v) => { setNoshow(v); savePolicy({ noshowDeducts: v, cancelCutoffHours: cutoff }); }} />
          </div>
          <div className="mt-2.5 flex items-center gap-3 rounded-[13px] bg-[#FBF7F1] px-4 py-3.5">
            <Icon name="clock" size={18} className="text-sage-deep" />
            <div className="flex-1"><div className="text-[13px] font-semibold text-ink">취소 가능 시간</div><div className="mt-px text-[11px] font-medium text-[#9A917F]">수업 시작 전 이 시간 이내 취소는 차감</div></div>
            <div className="flex items-center gap-1.5">
              <button onClick={() => { const v = Math.max(0, cutoff - 1); setCutoff(v); savePolicy({ noshowDeducts: noshow, cancelCutoffHours: v }); }} className="flex h-7 w-7 items-center justify-center rounded-[8px] border border-[rgba(75,59,46,0.12)] bg-white text-[#766D60]"><Icon name="chevron-left" size={14} /></button>
              <span className="w-[52px] text-center text-[13.5px] font-bold text-ink">{cutoff}시간</span>
              <button onClick={() => { const v = Math.min(48, cutoff + 1); setCutoff(v); savePolicy({ noshowDeducts: noshow, cancelCutoffHours: v }); }} className="flex h-7 w-7 items-center justify-center rounded-[8px] border border-[rgba(75,59,46,0.12)] bg-white text-[#766D60]"><Icon name="chevron-right" size={14} /></button>
            </div>
          </div>
        </Card>

        {/* notifications */}
        <Card className="px-6 py-[22px]">
          <div className="text-[16px] font-bold text-ink">알림 설정</div>
          <div className="mb-3 mt-1 text-[12px] font-medium text-[#9A917F]">자동 발송 알림</div>
          {[
            { label: "만료 임박 안내", desc: "유효기간 임박 시 회원에게", on: nExpiry, set: setNExpiry, key: "notifExpiry" as const },
            { label: "수업 리마인더", desc: "예정 수업 알림", on: nSession, set: setNSession, key: "notifSession" as const },
            { label: "결제 완료 안내", desc: "결제·발급 시 알림", on: nPayment, set: setNPayment, key: "notifPayment" as const },
          ].map((n) => (
            <div key={n.key} className="flex items-center gap-3 px-1 py-3">
              <div className="flex-1"><div className="text-[13px] font-semibold text-ink">{n.label}</div><div className="mt-px text-[11px] font-medium text-[#9A917F]">{n.desc}</div></div>
              <Switch on={n.on} onChange={(v) => { n.set(v); saveNotif({ notifExpiry: n.key === "notifExpiry" ? v : nExpiry, notifSession: n.key === "notifSession" ? v : nSession, notifPayment: n.key === "notifPayment" ? v : nPayment }); }} />
            </div>
          ))}
        </Card>
      </div>

      {/* privacy */}
      <Card className="mt-[18px] px-6 py-[22px]">
        <div className="text-[16px] font-bold text-ink">화면 · 보안</div>
        <div className="mb-4 mt-1 text-[12px] font-medium text-[#9A917F]">매장에서 화면을 띄워둘 때 유용해요</div>
        <div className="flex items-center gap-3 rounded-[13px] bg-[#FBF7F1] px-4 py-3.5">
          <Icon name="lock-fill" size={18} className="text-sage-deep" />
          <div className="flex-1"><div className="text-[13px] font-semibold text-ink">매출 가리기</div><div className="mt-px text-[11px] font-medium text-[#9A917F]">금액을 흐리게 표시해 어깨너머 노출을 막아요</div></div>
          <PrivacyToggle />
        </div>
      </Card>

      {/* product modal */}
      {edit ? (
        <ConsoleModal
          title={edit.id ? "상품 수정" : "상품 추가"}
          onClose={() => setEdit(null)}
          footer={<><OBtn className="flex-1" onClick={() => setEdit(null)}>취소</OBtn><PBtn icon="check-bold" className="flex-[1.6]" disabled={busy} onClick={saveProduct}>저장</PBtn></>}
        >
          <PField label="상품명"><PInput value={edit.name} onChange={(v) => setEdit({ ...edit, name: v })} placeholder="1:1 PT 20회권" /></PField>
          <div className="grid grid-cols-2 gap-2.5">
            <PField label="횟수"><PInput value={edit.sessions} onChange={(v) => setEdit({ ...edit, sessions: v })} placeholder="20" /></PField>
            <PField label="유효기간(일)"><PInput value={edit.durationDays} onChange={(v) => setEdit({ ...edit, durationDays: v })} placeholder="60" /></PField>
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            <PField label="판매가"><PInput value={edit.price} onChange={(v) => setEdit({ ...edit, price: v })} placeholder="1400000" /></PField>
            <PField label="정가(회당, 선택)"><PInput value={edit.unitListPrice} onChange={(v) => setEdit({ ...edit, unitListPrice: v })} placeholder="자동" /></PField>
          </div>
        </ConsoleModal>
      ) : null}
    </>
  );
}

function PField({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="mb-3.5"><div className="mb-[7px] text-[12px] font-semibold text-[#766D60]">{label}</div>{children}</div>;
}
function PInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="w-full rounded-[13px] border border-[rgba(75,59,46,0.14)] bg-[#FBF9F5] px-[15px] py-[12px] text-[14px] font-medium text-ink outline-none focus-visible:ring-2 focus-visible:ring-sage/40 placeholder:text-[#B3AA9C]" />;
}
