"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/icon";
import { PlainTextInput } from "@/components/ui/PlainTextInput";
import { Avatar, TeamAvatar } from "@/components/ui/Avatar";
import { useToast } from "@/components/ui/Toast";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { Card, PBtn, OBtn, DPill, ConsoleModal, MicroLabel, won, pill } from "@/components/console/ui";
import { loadMemberDetail, consoleIssueMembership, loadMemberRenewableProducts } from "@/lib/data/groups/console-actions";
import { listMemberFiles } from "@/lib/data/groups/member-files-actions";
import { listMemberMeals } from "@/lib/data/groups/meals-actions";
import type { MemberFileView } from "@/lib/data/groups/member-files";
import type { MealLog } from "@/lib/data/groups/meals";
import { extendMembership, previewRefund, refundMembership, pauseMembership, resumeMembership, transferMembership } from "@/lib/data/groups/membership-actions";
import { createMember, createDuetMembers, deleteMember, updateMember, setMemberStatus } from "@/lib/data/groups/owner-ops-actions";
import { QUAD_TABS, matchesQuad, isUnclassified, isDuetProduct, isDiscountProduct, productShortLabel, productTier, type Quad } from "@/lib/data/product-class";
import { BulkAddModal, type TrainerOpt } from "./bulk";
import { BodyRecordSection, MealsSection } from "./BodyMeals";
import { ScheduleEditModal } from "./ScheduleEditor";
import { TeamCreateModal, TeamEditModal } from "./TeamCreate";
import type { MemberDetailView, MemberListItem, MembershipProduct, Gender, PaymentMethod } from "@/lib/types";
import { formatPhone } from "@/components/ui/Field";

type Status = "active" | "expiring" | "rest" | "inactive";
const FILTERS: { key: "all" | "expiring" | "active" | "rest"; label: string }[] = [
  { key: "all", label: "전체" },
  { key: "expiring", label: "만료 임박" },
  { key: "active", label: "활성" },
  { key: "rest", label: "휴면" },
];
const METHODS: { v: PaymentMethod; l: string }[] = [
  { v: "card", l: "카드" },
  { v: "cash", l: "현금" },
  { v: "account", l: "계좌이체" },
];
const EVENT_LABEL: Record<string, string> = { issue: "발급", extend: "연장", refund: "환불", transfer: "양도", pause: "정지", resume: "재개" };
const STATUS_OPTS: { v: "active" | "rest" | "inactive"; l: string }[] = [
  { v: "active", l: "활성" },
  { v: "rest", l: "휴면" },
  { v: "inactive", l: "탈퇴" },
];
const DAYS = ["일", "월", "화", "수", "목", "금", "토"];
function hourLabel(h: number) {
  if (h < 12) return `오전 ${h}시`;
  if (h === 12) return "오후 12시";
  return `오후 ${h - 12}시`;
}
const HOUR_OPTIONS = Array.from({ length: 17 }, (_, i) => ({ value: String(i + 6), label: hourLabel(i + 6) }));
const todayStr = () => new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10); // KST

export function MembersClient({
  items,
  statusById,
  products,
  allProducts,
  trainers,
  ownerId,
  initialId,
  initialDetail,
  initialFiles,
  initialMeals,
}: {
  items: MemberListItem[];
  statusById: Record<string, Status>;
  products: MembershipProduct[];
  allProducts: MembershipProduct[]; // 판매중 + 단종 — 한꺼번에 입력(기존 회원 승계)에서만 사용
  trainers: TrainerOpt[];
  ownerId: string;
  initialId: string | null;
  initialDetail: MemberDetailView | null;
  initialFiles: MemberFileView[];
  initialMeals: MealLog[];
}) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["key"]>("all");
  const [selectedId, setSelectedId] = useState(initialId);
  const [detail, setDetail] = useState(initialDetail);
  const [files, setFiles] = useState<MemberFileView[]>(initialFiles);
  const [meals, setMeals] = useState<MealLog[]>(initialMeals);
  const [, startLoad] = useTransition();
  const [modal, setModal] = useState<null | "add" | "bulk" | "issue" | "extend" | "refund" | "schedule" | "team" | "delete" | "edit" | "transfer">(null);
  const [busy, setBusy] = useState(false);

  // 회원 정보 수정 폼 — birth는 선택 입력(변경 시 비번 초기화), 저장 후 비운다.
  const [ef, setEf] = useState({ name: "", phone: "", gender: "female" as Gender, injury: "", birth: "" });
  const [transferPhone, setTransferPhone] = useState("");

  // 결제 금액은 상품 가격 그대로(할인은 특별할인 상품이 담당 — 금액 차감 없음).
  const [f, setF] = useState({ name: "", phone: "", birth: "", gender: "female" as Gender, trainerId: ownerId, productId: "", method: "card" as PaymentMethod, amount: "" });
  // 등록: 수업 형태는 선택한 회원권으로 파생 — 2:1 상품을 고르면 듀엣(파트너 함께 등록).
  const [p2, setP2] = useState({ name: "", phone: "", birth: "", gender: "female" as Gender });
  const [payDate, setPayDate] = useState(todayStr());
  const [dayTimes, setDayTimes] = useState<Record<number, { hour: number; minute: number }>>({});
  const [issueProduct, setIssueProduct] = useState("");
  const [issueMethod, setIssueMethod] = useState<PaymentMethod>("card");
  const [issueAmt, setIssueAmt] = useState("");
  const [issueRenewable, setIssueRenewable] = useState<MembershipProduct[]>([]); // 선택 회원의 단종 상품(연장 전용)
  const [refund, setRefund] = useState<{ refund: number; used: number; noBaseline: boolean } | null>(null);
  const [refundMethod, setRefundMethod] = useState<PaymentMethod>("card");
  const [refundAmt, setRefundAmt] = useState("");
  const [refundErr, setRefundErr] = useState<string | null>(null);

  const query = q.trim();
  const list = items.filter(
    (m) => (filter === "all" || statusById[m.id] === filter) && (query === "" || m.name.includes(query) || m.sub.includes(query)),
  );
  // 듀엣 여부는 선택한 회원권으로 파생 — 2:1 상품이면 파트너 함께 등록.
  const is2on1 = isDuetProduct(products.find((p) => p.id === f.productId)?.name ?? "");

  async function loadAttachments(id: string) {
    const [fs, ms] = await Promise.all([listMemberFiles(id), listMemberMeals(id)]);
    setFiles(fs);
    setMeals(ms.meals);
  }
  function select(id: string) {
    setSelectedId(id);
    setFiles([]);
    setMeals([]);
    startLoad(async () => {
      const [d] = await Promise.all([loadMemberDetail(id), loadAttachments(id)]);
      setDetail(d);
    });
  }
  async function reload() {
    if (selectedId) setDetail(await loadMemberDetail(selectedId));
  }
  async function reloadAttachments() {
    if (selectedId) await loadAttachments(selectedId);
  }

  async function doExtend() {
    if (!detail?.activeMembershipId) return;
    setBusy(true);
    const r = await extendMembership(detail.activeMembershipId);
    setBusy(false);
    if (!r.ok) return toast(r.error ?? "연장에 실패했어요", "error");
    toast("유효기간을 연장했어요");
    setModal(null);
    await reload();
    router.refresh();
  }
  async function openRefund() {
    if (!detail?.activeMembershipId) return;
    setRefund(null); setRefundErr(null); setRefundAmt(""); setRefundMethod("card");
    setModal("refund");
    const p = (await previewRefund(detail.activeMembershipId)) as { ok: boolean; refund?: number; used?: number; noBaseline?: boolean; error?: string };
    if (!p.ok) { setRefundErr(p.error ?? "환불 금액을 계산하지 못했어요. 금액을 직접 입력해주세요."); return; }
    setRefund({ refund: p.refund ?? 0, used: p.used ?? 0, noBaseline: !!p.noBaseline });
    // noBaseline(이관): 산식이 항상 0원 → prefill하면 0원 원클릭 환불 가능(감사3 #7). 직접 입력 강제.
    setRefundAmt(p.noBaseline ? "" : String(p.refund ?? 0));
  }
  async function doRefund() {
    if (!detail?.activeMembershipId) return;
    const n = Number(refundAmt);
    if (refundAmt === "" || !Number.isInteger(n) || n < 0) return toast("환불 금액을 확인해주세요", "error");
    setBusy(true);
    const r = await refundMembership({ membershipId: detail.activeMembershipId, method: refundMethod, amountOverride: n });
    setBusy(false);
    if (!r.ok) return toast(r.error ?? "환불에 실패했어요", "error");
    toast("환불을 처리했어요");
    setModal(null);
    await reload();
    router.refresh();
  }
  function openIssue() {
    // 기본 미선택 — 대표가 상품을 직접 고른다(숨은 상품이 조용히 발급되는 것 방지, 발급 버튼은 선택 전 비활성).
    setIssueProduct("");
    setIssueAmt("");
    setIssueMethod("card");
    setIssueRenewable([]);
    setModal("issue");
    // 이 회원이 쓰던 단종 상품을 픽커에 합쳐 연장할 수 있게(신규 등록 폼엔 안 합쳐 단종 숨김 유지).
    if (selectedId) loadMemberRenewableProducts(selectedId).then(setIssueRenewable).catch(() => {});
  }
  async function doIssue() {
    if (!selectedId || !issueProduct) return;
    const amt = Number(issueAmt);
    if (!Number.isInteger(amt) || amt <= 0) return toast("결제 금액을 확인해주세요", "error");
    setBusy(true);
    const r = await consoleIssueMembership(selectedId, issueProduct, issueMethod, amt);
    setBusy(false);
    if (!r.ok) return toast(r.error ?? "발급에 실패했어요", "error");
    toast("회원권을 발급했어요");
    setModal(null);
    await reload();
    router.refresh();
  }
  function resetAddForm() {
    setF({ name: "", phone: "", birth: "", gender: "female", trainerId: ownerId, productId: "", method: "card", amount: "" });
    setP2({ name: "", phone: "", birth: "", gender: "female" });
    setPayDate(todayStr());
    setDayTimes({});
  }
  /** 상품 선택 시 담당 강사 기본값을 상품 담당(대표/강사)에 맞춘다 — 강제 아님, 이후 자유 변경. */
  function trainerForProduct(name: string, current: string): string {
    const tier = productTier(name);
    if (tier === "owner" && current !== ownerId) return ownerId;
    if (tier === "staff" && current === ownerId) return trainers.find((t) => t.id !== ownerId)?.id ?? current;
    return current;
  }
  function openAdd() {
    resetAddForm();
    setModal("add");
  }
  function toggleDay(i: number) {
    setDayTimes((prev) => {
      const next = { ...prev };
      if (next[i] != null) delete next[i];
      else next[i] = { hour: 19, minute: 0 };
      return next;
    });
  }
  async function doAdd() {
    if (busy) return;
    if (!f.name.trim() || !f.phone.trim() || f.birth.replace(/\D/g, "").length !== 6) return toast("이름·연락처·생년월일(6자리)을 입력해주세요", "error");
    if (is2on1 && (!p2.name.trim() || !p2.phone.trim() || p2.birth.replace(/\D/g, "").length !== 6))
      return toast("듀엣 파트너의 이름·연락처·생년월일(6자리)을 입력해주세요", "error");
    if (f.productId) {
      const amt = Number(f.amount);
      if (!Number.isInteger(amt) || amt <= 0) return toast("결제 금액을 확인해주세요", "error");
    }
    const slots = Object.entries(dayTimes)
      .map(([wd, t]) => ({ weekday: Number(wd), hour: t.hour, minute: t.minute }))
      .sort((a, b) => a.weekday - b.weekday);
    const product = f.productId ? { productId: f.productId } : undefined;
    // 입력값은 합계(2:1이면 두 회원 합). 회원당 결제 1건이라 듀엣은 절반씩 나눠 기록한다.
    const payment = f.productId ? { method: f.method, amount: is2on1 ? Math.round(Number(f.amount) / 2) : Number(f.amount), paidAt: payDate || undefined } : undefined;
    setBusy(true);
    const r = is2on1
      ? await createDuetMembers({
          members: [
            { name: f.name, phone: f.phone, birth: f.birth, gender: f.gender },
            { name: p2.name, phone: p2.phone, birth: p2.birth, gender: p2.gender },
          ],
          trainerId: f.trainerId,
          slots,
          product,
          payment,
        })
      : await createMember({ name: f.name, phone: f.phone, birth: f.birth, gender: f.gender, slots, trainerId: f.trainerId, product, payment });
    setBusy(false);
    if (!r.ok) return toast(r.error ?? "등록에 실패했어요", "error");
    toast(r.warn ?? (is2on1 ? "듀엣 회원 두 명을 등록했어요" : "회원을 등록했어요"));
    setModal(null);
    resetAddForm();
    router.refresh();
    if (r.memberId) select(r.memberId);
  }
  async function doDelete() {
    if (busy || !selectedId) return;
    setBusy(true);
    const r = await deleteMember(selectedId);
    setBusy(false);
    if (!r.ok) return toast(r.error ?? "삭제에 실패했어요", "error");
    toast("회원을 삭제했어요");
    setModal(null);
    setSelectedId(null);
    setDetail(null);
    router.refresh();
  }

  function openEdit() {
    if (!d) return;
    setEf({ name: d.name, phone: d.phone, gender: (d.gender ?? "female") as Gender, injury: d.injury ?? "", birth: "" });
    setModal("edit");
  }
  async function doEdit() {
    if (busy || !selectedId) return;
    if (!ef.name.trim() || !ef.phone.trim()) return toast("이름·연락처를 입력해주세요", "error");
    setBusy(true);
    const r = await updateMember(selectedId, { name: ef.name, phone: ef.phone, gender: ef.gender, injuryNote: ef.injury, birth: ef.birth });
    setBusy(false);
    if (!r.ok) return toast(r.error ?? "수정에 실패했어요", "error");
    setEf((s) => ({ ...s, birth: "" })); // 저장 후 비움 — stale 생년월일이 다음 편집서 재차 비번 초기화 트리거하지 않도록
    toast("회원 정보를 수정했어요");
    setModal(null);
    await reload();
    router.refresh();
  }

  async function changeStatus(next: "active" | "rest" | "inactive") {
    if (busy || !selectedId || next === (d?.memberStatus ?? "active")) return;
    if (
      next === "inactive" &&
      !(await confirm({ title: "이 회원을 탈퇴 처리할까요?", description: "정기 수업(1:1)이 자동으로 중지돼요.", confirmLabel: "탈퇴 처리", tone: "warn" }))
    )
      return;
    setBusy(true);
    const r = await setMemberStatus(selectedId, next);
    setBusy(false);
    if (!r.ok) return toast(r.error ?? "상태 변경에 실패했어요", "error");
    toast(next === "active" ? "활성으로 전환했어요" : next === "rest" ? "휴면으로 전환했어요" : "탈퇴 처리했어요");
    await reload();
    router.refresh();
  }

  async function doPause() {
    if (busy || !d?.activeMembershipId) return;
    // 2:1 팀은 한 명만 정지해도 팀 수업은 계속 생성되나 출석 확정이 막힌다 — 파트너 일정도 함께 조정하도록 알린다.
    if (d.isTeam && !(await confirm({ title: "2:1 팀 수업 중인 회원이에요", description: "정지하면 팀 수업 진행이 막혀요. 파트너 일정도 함께 조정해주세요.", confirmLabel: "정지" }))) return;
    setBusy(true);
    const r = await pauseMembership(d.activeMembershipId);
    setBusy(false);
    if (!r.ok) return toast(r.error ?? "정지에 실패했어요", "error");
    toast("회원권을 일시정지했어요");
    await reload();
    router.refresh();
  }
  async function doResume() {
    if (busy || !d?.activeMembershipId) return;
    setBusy(true);
    const r = await resumeMembership(d.activeMembershipId);
    setBusy(false);
    if (!r.ok) return toast(r.error ?? "재개에 실패했어요", "error");
    toast("회원권을 재개했어요 (정지기간만큼 연장)");
    await reload();
    router.refresh();
  }

  function openTransfer() {
    if (!d?.activeMembershipId) return;
    setTransferPhone("");
    setModal("transfer");
  }
  async function doTransfer() {
    if (busy || !d?.activeMembershipId) return;
    if (transferPhone.replace(/\D/g, "").length < 10) return toast("휴대폰 번호를 확인해주세요", "error");
    setBusy(true);
    const r = await transferMembership({ membershipId: d.activeMembershipId, toPhone: transferPhone.replace(/\D/g, "") });
    setBusy(false);
    if (!r.ok) return toast(r.error ?? "양도에 실패했어요", "error");
    toast("양도했어요 (잔여 회차 이전 완료)");
    setModal(null);
    await reload();
    router.refresh();
  }

  const d = detail;

  return (
    <>
      {/* toolbar */}
      <div className="mb-5 flex items-center gap-3">
        <div className="flex max-w-[380px] flex-1 items-center gap-2.5 rounded-[13px] border border-[rgba(75,59,46,0.1)] bg-white px-[15px] py-[11px]">
          <Icon name="search" size={18} className="text-[#A89F92]" />
          <PlainTextInput value={q} onChange={setQ} placeholder="이름 검색" wrapperClassName="w-full" className="w-full bg-transparent text-[14px] font-medium text-ink outline-none placeholder:text-[#B3AA9C]" />
          {q ? <button onClick={() => setQ("")} aria-label="지우기" className="flex-none text-[#C2BAAD]"><Icon name="circle-close" size={17} /></button> : null}
        </div>
        <div className="flex gap-[7px]">
          {FILTERS.map((ff) => {
            const on = filter === ff.key;
            return (
              <button key={ff.key} onClick={() => setFilter(ff.key)} className={`rounded-[10px] px-3 py-[9px] text-[13px] font-semibold transition ${on ? "bg-sage text-white" : "bg-white text-[#766D60] border border-[rgba(75,59,46,0.1)]"}`}>
                {ff.label}
              </button>
            );
          })}
        </div>
        <OBtn icon="persons" className="ml-auto" onClick={() => setModal("bulk")}>한꺼번에 입력</OBtn>
        <PBtn icon="person-plus" onClick={openAdd}>회원 등록</PBtn>
      </div>

      <div className="grid grid-cols-[1.25fr_1fr] items-start gap-[18px]">
        {/* list */}
        <Card className="overflow-hidden">
          <div className="flex items-center border-b border-[rgba(75,59,46,0.07)] px-5 py-[13px] text-[11.5px] font-semibold tracking-[0.02em] text-[#9A917F]">
            <span className="flex-1">회원 · <span className="text-sage-deep">{list.length}명</span></span>
            <span className="w-[150px]">정기 일정 · 잔여</span>
            <span className="w-[60px] text-right">만료</span>
          </div>
          <div>
            {list.map((m) => {
              const on = m.id === selectedId;
              return (
                <button key={m.id} onClick={() => select(m.id)} className={`flex w-full items-center gap-[13px] border-b border-[rgba(75,59,46,0.05)] px-5 py-[13px] text-left transition-colors ${on ? "bg-[#EDF4E3]" : "hover:bg-[#FBFAF7]"}`}>
                  {m.isTeam && m.team ? <TeamAvatar team={m.team} size={40} /> : <Avatar initial={m.initial} tone={m.avatarTone} size={40} />}
                  <div className="min-w-0 flex-1 overflow-hidden">
                    <div className="truncate text-[14px] font-semibold text-ink">{m.name}</div>
                    <div className="truncate text-[11.5px] font-medium text-[#9A917F]">{m.sub}</div>
                  </div>
                  <span className="w-[60px] text-right"><BadgePill badge={m.badge} /></span>
                </button>
              );
            })}
            {list.length === 0 ? (
              <div className="px-5 py-12 text-center">
                <div className="text-[14px] font-semibold text-[#847A66]">검색 결과가 없어요</div>
                <div className="mt-1.5 text-[12.5px] font-medium text-[#A89F92]">다른 이름으로 찾아보세요</div>
              </div>
            ) : null}
          </div>
        </Card>

        {/* detail */}
        <Card className="sticky top-0 px-6 pb-[22px] pt-6">
          {d ? (
            <>
              <div className="mb-5 flex items-center gap-[15px]">
                {d.isTeam && d.team ? <TeamAvatar team={d.team} size={60} /> : <Avatar initial={d.initial} tone={d.avatarTone} size={60} fontSize={22} />}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="whitespace-nowrap text-[20px] font-bold tracking-[-0.01em] text-ink">{d.name}</span>
                    <DPill dDay={d.activeMembershipId ? d.dDay : null} />
                    {d.isTeam && d.partnerId && d.partnerName ? (
                      <button
                        type="button"
                        onClick={() => select(d.partnerId!)}
                        className="flex items-center gap-1 rounded-[9px] bg-[#EDF4E3] px-2.5 py-1 text-[12px] font-semibold text-[#5B6452] transition hover:bg-[#E3ECD6]"
                      >
                        <Icon name="persons" size={13} />
                        {d.partnerName} 보기
                      </button>
                    ) : null}
                  </div>
                  <div className="mt-0.5 truncate text-[13px] font-medium text-[#847A66]">{d.schedule}</div>
                </div>
                <button
                  type="button"
                  onClick={openEdit}
                  aria-label="회원 정보 수정"
                  className="flex-none rounded-[10px] border border-[rgba(75,59,46,0.14)] bg-[#FBF9F5] px-3 py-[9px] text-[12.5px] font-semibold text-[#5B6452] transition hover:bg-[#F4F0E8]"
                >
                  <Icon name="pencil" size={15} />
                </button>
              </div>

              {/* 회원 상태 — 활성/휴면/탈퇴 */}
              <div className="mb-4 flex items-center gap-1.5 rounded-[13px] border border-[rgba(75,59,46,0.08)] bg-white px-2 py-2">
                {STATUS_OPTS.map((o) => {
                  const on = (d.memberStatus ?? "active") === o.v;
                  return (
                    <button
                      key={o.v}
                      type="button"
                      disabled={busy}
                      onClick={() => changeStatus(o.v)}
                      className={`flex-1 rounded-[10px] py-2 text-[13px] font-bold transition disabled:opacity-50 ${on ? "bg-sage text-white" : "text-[#847A66] hover:bg-[rgba(75,59,46,0.04)]"}`}
                    >
                      {o.l}
                    </button>
                  );
                })}
              </div>

              {/* membership card */}
              {d.activeMembershipId ? (
                <div className="relative mb-4 overflow-hidden rounded-[16px] px-5 py-[18px]" style={{ background: "#768C6A" }}>
                  <div className="mb-3.5 flex items-center justify-between">
                    <span className="text-[13px] font-semibold text-[#E7EDDF]">{d.product}</span>
                    <span style={pill("#26231E", "#E7DCC5")}>D-{d.dDay}</span>
                  </div>
                  <div className="flex items-end gap-1.5">
                    <span className="serif text-[44px] font-semibold leading-[0.8] text-surface">{d.remaining}</span>
                    <span className="pb-[5px] text-[15px] font-semibold text-[#D7DCCF]">/ {d.total}회 남음</span>
                  </div>
                  <div className="mt-3.5 h-1.5 overflow-hidden rounded-[4px] bg-[rgba(250,248,244,0.22)]">
                    <div className="h-full rounded-[4px] bg-[#E7DCC5]" style={{ width: `${d.barPct}%` }} />
                  </div>
                  <div className="mt-2.5 text-[11.5px] font-medium text-[#CBD2BE]">유효기간 {d.startDate} ~ {d.endDate}</div>
                </div>
              ) : (
                <div className="mb-4 rounded-[16px] border border-[rgba(75,59,46,0.08)] bg-[#FBF7F1] px-5 py-6 text-center">
                  <div className="text-[14px] font-semibold text-[#847A66]">활성 회원권이 없어요</div>
                  <div className="mt-1 text-[12px] font-medium text-[#A89F92]">회원권을 발급해 주세요</div>
                </div>
              )}

              {/* actions */}
              <div className="mb-2.5 grid grid-cols-3 gap-[9px]">
                <OBtn icon="calendar" className="whitespace-nowrap !px-2" disabled={!d.activeMembershipId} onClick={() => setModal("extend")}>기간 연장</OBtn>
                <OBtn icon="coins" className="whitespace-nowrap !px-2" disabled={!d.activeMembershipId} onClick={openRefund}>환불</OBtn>
                <PBtn className="whitespace-nowrap !px-2" onClick={openIssue}>회원권 발급</PBtn>
              </div>
              <div className="mb-3 grid grid-cols-2 gap-[9px]">
                {d.membershipPaused ? (
                  <OBtn icon="play" className="whitespace-nowrap !px-2" disabled={!d.activeMembershipId} onClick={doResume}>재개</OBtn>
                ) : (
                  <OBtn icon="pause" className="whitespace-nowrap !px-2" disabled={!d.activeMembershipId} onClick={doPause}>일시정지</OBtn>
                )}
                <OBtn icon="arrow-right" className="whitespace-nowrap !px-2" disabled={!d.activeMembershipId} onClick={openTransfer}>양도</OBtn>
              </div>

              {/* 정기 수업 일정 */}
              <div className="mb-[10px] flex items-center gap-2.5 rounded-[13px] border border-[rgba(75,59,46,0.1)] bg-white px-4 py-3">
                <Icon name="calendar" size={16} className="flex-none text-sage-deep" />
                <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-ink">{d.schedule}</span>
                <button
                  type="button"
                  onClick={() => setModal("schedule")}
                  className="flex-none rounded-[9px] border border-[rgba(75,59,46,0.14)] bg-[#FBF9F5] px-3 py-[6px] text-[12.5px] font-semibold text-[#5B6452] transition hover:bg-[#F4F0E8]"
                >
                  일정 편집
                </button>
              </div>

              {/* 2:1 팀 — 팀이면 일정 편집·해제, 아니면 새로 묶기 */}
              <button
                type="button"
                onClick={() => setModal("team")}
                className="mb-[18px] flex w-full items-center gap-2.5 rounded-[13px] border border-dashed border-[rgba(138,111,62,0.35)] bg-[#FBF7EF] px-4 py-3 text-left transition hover:bg-[#F6EFE2]"
              >
                <Icon name="persons" size={16} className="flex-none text-[#8A6F3E]" />
                <span className="flex-1 text-[13px] font-semibold text-[#7A6338]">{d.isTeam ? "2:1 팀 일정 편집" : "2:1 팀으로 묶기"}</span>
                <Icon name="chevron-right" size={15} className="flex-none text-[#B79A63]" />
              </button>

              {d.injury ? (
                <div className="mb-[18px] flex items-start gap-2.5 rounded-[13px] bg-[#FBF3E9] px-4 py-3">
                  <Icon name="triangle-exclamation" size={16} className="mt-px flex-none text-terracotta" />
                  <span className="text-[12.5px] font-medium leading-relaxed text-[#9A8772]">{d.injury}</span>
                </div>
              ) : null}

              {/* 체형 기록 — 체성분 + 진행 사진 + 인바디 (업로드·삭제) */}
              <BodyRecordSection
                memberId={d.id}
                photos={files.filter((f) => f.kind === "photo")}
                inbodies={files.filter((f) => f.kind === "inbody")}
                body={d.body}
                onChanged={reloadAttachments}
              />

              {/* 식단 — 조회 + 피드백 */}
              <MealsSection meals={meals} onChanged={reloadAttachments} />

              <div className="mb-[18px]" />

              {/* membership history */}
              <MicroLabel className="mb-2.5">회원권 이력</MicroLabel>
              {d.events.length > 0 ? (
                <div className="flex flex-col gap-2">
                  {d.events.map((e, i) => (
                    <div key={i} className="flex items-center gap-[11px] rounded-[11px] bg-[#FBF7F1] px-3.5 py-[9px]">
                      <Icon name="ticket" size={15} className="text-sage-deep" />
                      <span className="flex-1 text-[12.5px] font-semibold text-[#5B5345]">{EVENT_LABEL[e.type] ?? e.type}{e.note ? ` · ${e.note}` : ""}</span>
                      <span className="text-[12px] font-medium text-[#9A917F]">{e.createdAt}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="px-0.5 text-[12px] font-medium text-[#B3AA9C]">아직 이력이 없어요</div>
              )}

              {/* 회원 완전 삭제 — 탈퇴와 별도의 영구 삭제 */}
              <div className="mt-[18px] border-t border-[rgba(75,59,46,0.08)] pt-4">
                <button
                  type="button"
                  onClick={() => setModal("delete")}
                  className="flex items-center gap-1.5 text-[12.5px] font-semibold text-terracotta transition hover:opacity-80"
                >
                  <Icon name="circle-close" size={15} />
                  회원 완전 삭제
                </button>
              </div>
            </>
          ) : (
            <div className="py-16 text-center text-[14px] font-medium text-[#A89F92]">회원을 선택하세요</div>
          )}
        </Card>
      </div>

      {/* ===== modals ===== */}
      {modal === "add" ? (
        <ConsoleModal
          title="회원 등록"
          onClose={() => setModal(null)}
          footer={<><OBtn className="flex-1" onClick={() => setModal(null)}>취소</OBtn><PBtn icon="check-bold" className="flex-[1.6]" pending={busy} onClick={doAdd}>등록</PBtn></>}
        >
          {/* ① 회원권 — 맨 위에서 고르면 1:1/2:1이 정해진다. 2:1이면 아래 파트너 입력이 열림 */}
          <SectionHead no={1} title="회원권" hint="선택 · 나중에 발급해도 돼요" />
          <ProductPicker
            products={products}
            selected={f.productId}
            showPrice
            onPick={(id) => {
              const newId = f.productId === id ? "" : id;
              const p = products.find((pp) => pp.id === newId);
              setF({
                ...f,
                productId: newId,
                amount: p ? String(isDuetProduct(p.name) ? p.price * 2 : p.price) : f.amount,
                trainerId: p ? trainerForProduct(p.name, f.trainerId) : f.trainerId,
              });
            }}
            onClear={() => setF((prev) => ({ ...prev, productId: "", amount: "" }))}
          />

          {/* ② 회원 정보 */}
          <SectionHead no={2} title="회원 정보" hint={is2on1 ? "2:1 — 두 명이 함께 등록돼요" : undefined} />
          {is2on1 ? <div className="mb-2 text-[12px] font-bold text-[#7A6338]">회원 1</div> : null}
          <ModalField label="이름"><Input value={f.name} onChange={(v) => setF({ ...f, name: v })} placeholder="회원 이름" /></ModalField>
          <ModalField label="연락처"><Input value={formatPhone(f.phone)} onChange={(v) => setF({ ...f, phone: v.replace(/\D/g, "").slice(0, 11) })} placeholder="010-0000-0000" /></ModalField>
          <div className="grid grid-cols-2 gap-2.5">
            <ModalField label="생년월일 (6자리)"><Input value={f.birth} onChange={(v) => setF({ ...f, birth: v.replace(/\D/g, "").slice(0, 6) })} placeholder="YYMMDD" /></ModalField>
            <ModalField label="성별">
              <div className="flex gap-2">
                {([["female", "여성"], ["male", "남성"]] as const).map(([g, l]) => (
                  <button key={g} onClick={() => setF({ ...f, gender: g })} className={`flex-1 rounded-[12px] py-[11px] text-[13.5px] font-semibold transition ${f.gender === g ? "bg-sage text-white" : "border border-[rgba(75,59,46,0.14)] bg-[#FBF9F5] text-[#766D60]"}`}>{l}</button>
                ))}
              </div>
            </ModalField>
          </div>

          {/* 회원 2 (듀엣 파트너) — 2:1 회원권 선택 시 함께 등록 */}
          {is2on1 ? (
            <div className="mb-3.5 mt-1 rounded-[13px] border border-[rgba(138,111,62,0.28)] bg-[#FBF7EF] p-3.5">
              <div className="mb-2.5 text-[12px] font-bold text-[#7A6338]">회원 2 · 듀엣 파트너</div>
              <ModalField label="이름"><Input value={p2.name} onChange={(v) => setP2({ ...p2, name: v })} placeholder="파트너 이름" /></ModalField>
              <ModalField label="연락처"><Input value={formatPhone(p2.phone)} onChange={(v) => setP2({ ...p2, phone: v.replace(/\D/g, "").slice(0, 11) })} placeholder="010-0000-0000" /></ModalField>
              <div className="grid grid-cols-2 gap-2.5">
                <ModalField label="생년월일 (6자리)"><Input value={p2.birth} onChange={(v) => setP2({ ...p2, birth: v.replace(/\D/g, "").slice(0, 6) })} placeholder="YYMMDD" /></ModalField>
                <ModalField label="성별">
                  <div className="flex gap-2">
                    {([["female", "여성"], ["male", "남성"]] as const).map(([g, l]) => (
                      <button key={g} onClick={() => setP2({ ...p2, gender: g })} className={`flex-1 rounded-[12px] py-[11px] text-[13.5px] font-semibold transition ${p2.gender === g ? "bg-sage text-white" : "border border-[rgba(75,59,46,0.14)] bg-[#FBF9F5] text-[#766D60]"}`}>{l}</button>
                    ))}
                  </div>
                </ModalField>
              </div>
              <div className="text-[11px] font-medium text-[#9A8772]">두 회원에게 각각 발급·결제돼요.</div>
            </div>
          ) : null}

          {/* ③ 담당 · 결제 — 담당 기본값은 상품 담당(대표/강사)과 연동, 결제란은 상품 선택 시에만 */}
          <SectionHead no={3} title={f.productId ? "담당 · 결제" : "담당 강사"} hint={f.productId && is2on1 ? "두 회원 합계 금액" : undefined} />
          <ModalField label="담당 강사">
            <select
              value={f.trainerId}
              onChange={(e) => setF({ ...f, trainerId: e.target.value })}
              className="w-full rounded-[13px] border border-[rgba(75,59,46,0.14)] bg-[#FBF9F5] px-[15px] py-[12px] text-[14px] font-medium text-ink outline-none focus-visible:ring-2 focus-visible:ring-sage/40"
            >
              {trainers.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </ModalField>

          {f.productId ? (
            <>
              <ModalField label="결제 금액">
                <input
                  value={f.amount ? Number(f.amount).toLocaleString("ko-KR") : ""}
                  onChange={(e) => setF({ ...f, amount: e.target.value.replace(/\D/g, "").slice(0, 12) })}
                  inputMode="numeric"
                  placeholder="₩ 금액"
                  className="w-full rounded-[12px] border border-[rgba(75,59,46,0.14)] bg-[#FBF9F5] px-[15px] py-[12px] text-[14px] font-medium text-ink outline-none placeholder:text-[#B3AA9C]"
                />
              </ModalField>
              <ModalField label="결제 수단">
                <MethodPicker value={f.method} onChange={(m) => setF({ ...f, method: m })} />
              </ModalField>
              <ModalField label="결제일">
                <input
                  type="date"
                  value={payDate}
                  onChange={(e) => setPayDate(e.target.value)}
                  className="w-full rounded-[12px] border border-[rgba(75,59,46,0.14)] bg-[#FBF9F5] px-[15px] py-[11px] text-[14px] font-medium text-ink outline-none"
                />
              </ModalField>
            </>
          ) : null}

          {/* ④ 정기 수업 요일 (선택) — 고르면 매주 자동 생성. 2:1은 팀 일정으로 묶인다. */}
          <SectionHead no={4} title={is2on1 ? "팀 정기 수업 요일" : "정기 수업 요일"} hint="선택" />
          <div className="mb-2 flex gap-1.5">
            {DAYS.map((d, i) => {
              const on = dayTimes[i] != null;
              return (
                <button key={d} type="button" onClick={() => toggleDay(i)} className={`flex-1 rounded-[10px] py-2 text-[13px] font-bold transition ${on ? "bg-sage text-white" : `border border-[rgba(75,59,46,0.12)] bg-[#FBF9F5] ${i === 0 ? "text-terracotta" : "text-[#847A66]"}`}`}>{d}</button>
              );
            })}
          </div>
          {Object.keys(dayTimes).length > 0 ? (
            <div className="mb-3.5 flex flex-col gap-2">
              {Object.keys(dayTimes).map(Number).sort((a, b) => a - b).map((i) => (
                <div key={i} className="flex items-center gap-2 rounded-[12px] border border-[rgba(75,59,46,0.12)] bg-white px-3 py-2">
                  <span className={`w-6 text-center text-[13px] font-bold ${i === 0 ? "text-terracotta" : "text-ink"}`}>{DAYS[i]}</span>
                  <select value={String(dayTimes[i].hour)} onChange={(e) => setDayTimes((prev) => ({ ...prev, [i]: { ...prev[i], hour: Number(e.target.value) } }))} className="flex-1 rounded-[10px] border border-[rgba(75,59,46,0.12)] bg-[#FBF9F5] px-2 py-1.5 text-[13px] font-medium text-ink outline-none">
                    {HOUR_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                  <div className="flex gap-1">
                    {([[0, "정각"], [30, "30분"]] as const).map(([m, l]) => (
                      <button key={m} type="button" onClick={() => setDayTimes((prev) => ({ ...prev, [i]: { ...prev[i], minute: m } }))} className={`rounded-[9px] px-2.5 py-1.5 text-[12.5px] font-semibold transition ${dayTimes[i].minute === m ? "bg-sage text-white" : "border border-[rgba(75,59,46,0.12)] bg-[#FBF9F5] text-[#847A66]"}`}>{l}</button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </ConsoleModal>
      ) : null}

      {modal === "bulk" ? (
        <BulkAddModal
          products={allProducts}
          trainers={trainers}
          onClose={() => setModal(null)}
          onDone={() => router.refresh()}
        />
      ) : null}

      {modal === "schedule" && d ? (
        <ScheduleEditModal
          memberId={d.id}
          memberName={d.name}
          onClose={() => setModal(null)}
          onDone={async () => { await reload(); router.refresh(); }}
        />
      ) : null}

      {modal === "team" && d ? (
        d.isTeam ? (
          <TeamEditModal
            memberId={d.id}
            memberName={d.name}
            onClose={() => setModal(null)}
            onDone={async () => { await reload(); router.refresh(); }}
          />
        ) : (
          <TeamCreateModal
            memberId={d.id}
            memberName={d.name}
            onClose={() => setModal(null)}
            onDone={async () => { await reload(); router.refresh(); }}
          />
        )
      ) : null}

      {modal === "issue" && d ? (
        <ConsoleModal
          title="회원권 발급"
          onClose={() => setModal(null)}
          footer={<><OBtn className="flex-1" onClick={() => setModal(null)}>취소</OBtn><PBtn icon="check-bold" className="flex-[1.6]" pending={busy} disabled={!issueProduct} onClick={doIssue}>발급</PBtn></>}
        >
          <MemberStripe d={d} />
          <div className="mb-2.5 text-[11.5px] font-semibold text-[#9A917F]">회원권 상품</div>
          <ProductPicker
            products={[...products, ...issueRenewable]}
            selected={issueProduct}
            onPick={(id) => {
              setIssueProduct(id);
              const p = [...products, ...issueRenewable].find((pp) => pp.id === id);
              if (p) setIssueAmt(String(p.price));
            }}
            onClear={() => { setIssueProduct(""); setIssueAmt(""); }}
            showPrice
          />
          <div className="mb-2 mt-3 text-[11.5px] font-semibold text-[#9A917F]">결제 금액</div>
          <input
            value={issueAmt ? Number(issueAmt).toLocaleString("ko-KR") : ""}
            onChange={(e) => setIssueAmt(e.target.value.replace(/\D/g, "").slice(0, 12))}
            inputMode="numeric"
            placeholder="₩ 금액"
            className="mb-3.5 w-full rounded-[12px] border border-[rgba(75,59,46,0.14)] bg-[#FBF9F5] px-[15px] py-[12px] text-[14px] font-medium text-ink outline-none placeholder:text-[#B3AA9C]"
          />
          <div className="mb-2 text-[11.5px] font-semibold text-[#9A917F]">결제 수단</div>
          <MethodPicker value={issueMethod} onChange={setIssueMethod} />
        </ConsoleModal>
      ) : null}

      {modal === "extend" && d ? (
        <ConsoleModal
          title="기간 연장"
          onClose={() => setModal(null)}
          footer={<><OBtn className="flex-1" onClick={() => setModal(null)}>취소</OBtn><PBtn icon="check-bold" className="flex-[1.6]" pending={busy} onClick={doExtend}>연장</PBtn></>}
        >
          <MemberStripe d={d} />
          <div className="flex items-start gap-2.5 rounded-[13px] bg-[#F8F4EC] px-4 py-3.5">
            <Icon name="circle-info" size={17} className="mt-px flex-none text-[#A89F92]" />
            <span className="text-[12.5px] font-medium leading-relaxed text-[#766D60]">회원권 상품 기준 유효기간만큼 연장돼요. 잔여 횟수가 있어야 연장할 수 있어요.</span>
          </div>
        </ConsoleModal>
      ) : null}

      {modal === "refund" && d ? (
        <ConsoleModal
          title="환불"
          onClose={() => setModal(null)}
          footer={<><OBtn className="flex-1" onClick={() => setModal(null)}>취소</OBtn><PBtn icon="check-bold" className="flex-[1.6]" pending={busy} disabled={refundAmt === ""} onClick={doRefund}>환불 처리</PBtn></>}
        >
          <MemberStripe d={d} />
          <div className="mb-[18px] rounded-[14px] bg-[#FBF3E9] px-[18px] py-4">
            {refundErr ? <div className="mb-1.5 text-[13px] font-medium text-terracotta">{refundErr}</div> : null}
            <div className="mb-1.5 text-[12px] font-medium text-[#9A8772]">
              {refund ? `산식 기준 ${won(refund.refund)} · 사용 ${refund.used}회${refund.noBaseline ? " · 결제 기록 없음(이관)" : ""}` : refundErr ? "" : "계산 중…"}
            </div>
            <input
              value={refundAmt ? Number(refundAmt).toLocaleString("ko-KR") : ""}
              onChange={(e) => setRefundAmt(e.target.value.replace(/\D/g, "").slice(0, 12))}
              inputMode="numeric"
              placeholder="실제 환불 금액(원)"
              className="w-full rounded-[10px] border border-ink/10 bg-white px-3.5 py-2.5 text-[20px] font-bold text-terracotta"
            />
          </div>
          <div className="mb-2 text-[11.5px] font-semibold text-[#9A917F]">환불 수단</div>
          <MethodPicker value={refundMethod} onChange={setRefundMethod} />
          <div className="mt-4 flex items-start gap-2.5 rounded-[13px] bg-[#F8F4EC] px-4 py-3"><Icon name="circle-info" size={16} className="mt-px flex-none text-[#A89F92]" /><span className="text-[12px] font-medium leading-relaxed text-[#766D60]">환불 시 회원권은 즉시 종료되고 매출 내역에 기록돼요.</span></div>
        </ConsoleModal>
      ) : null}

      {modal === "delete" && d ? (
        <ConsoleModal
          title="회원 완전 삭제"
          onClose={() => setModal(null)}
          footer={<><OBtn className="flex-1" onClick={() => setModal(null)}>취소</OBtn><button onClick={doDelete} disabled={busy} className="flex-[1.6] rounded-[12px] bg-terracotta py-[11px] text-[14px] font-semibold text-white transition hover:brightness-105 disabled:opacity-50">완전 삭제</button></>}
        >
          <MemberStripe d={d} />
          <p className="text-[13.5px] leading-relaxed text-[#766D60]">
            <b className="text-ink">{d.name}</b> 회원을 삭제할까요? 회원권·결제·출석·기록·사진·식단이 모두 영구 삭제돼요. <b className="text-terracotta">되돌릴 수 없어요.</b>
          </p>
          <div className="mt-3 flex items-start gap-2.5 rounded-[13px] bg-[#F8F4EC] px-4 py-3"><Icon name="circle-info" size={16} className="mt-px flex-none text-[#A89F92]" /><span className="text-[12px] font-medium leading-relaxed text-[#766D60]">이용을 멈추되 기록을 남기려면 삭제 대신 위의 &lsquo;탈퇴&rsquo; 처리를 쓰세요.</span></div>
        </ConsoleModal>
      ) : null}

      {modal === "edit" && d ? (
        <ConsoleModal
          title="회원 정보 수정"
          onClose={() => setModal(null)}
          footer={<><OBtn className="flex-1" onClick={() => setModal(null)}>취소</OBtn><PBtn icon="check-bold" className="flex-[1.6]" pending={busy} onClick={doEdit}>저장</PBtn></>}
        >
          <ModalField label="이름"><Input value={ef.name} onChange={(v) => setEf({ ...ef, name: v })} placeholder="회원 이름" /></ModalField>
          <ModalField label="연락처"><Input value={formatPhone(ef.phone)} onChange={(v) => setEf({ ...ef, phone: v.replace(/\D/g, "").slice(0, 11) })} placeholder="010-0000-0000" /></ModalField>
          <ModalField label="성별">
            <div className="flex gap-2">
              {([["female", "여성"], ["male", "남성"]] as const).map(([g, l]) => (
                <button key={g} onClick={() => setEf({ ...ef, gender: g })} className={`flex-1 rounded-[12px] py-[11px] text-[13.5px] font-semibold transition ${ef.gender === g ? "bg-sage text-white" : "border border-[rgba(75,59,46,0.14)] bg-[#FBF9F5] text-[#766D60]"}`}>{l}</button>
              ))}
            </div>
          </ModalField>
          <ModalField label="생년월일 변경 (선택)"><Input value={ef.birth} onChange={(v) => setEf({ ...ef, birth: v.replace(/\D/g, "").slice(0, 6) })} placeholder="변경할 때만 입력 (예: 900325)" /></ModalField>
          <p className="mb-3.5 -mt-1.5 text-[11.5px] font-medium text-[#A89F92]">생년월일을 바꾸면 로그인 비밀번호도 새 생년월일 6자리로 초기화돼요.</p>
          <ModalField label="부상 메모 (선택)"><Input value={ef.injury} onChange={(v) => setEf({ ...ef, injury: v })} placeholder="예: 오른쪽 무릎 주의" /></ModalField>
        </ConsoleModal>
      ) : null}

      {modal === "transfer" && d ? (
        <ConsoleModal
          title="회원권 양도"
          onClose={() => setModal(null)}
          footer={<><OBtn className="flex-1" onClick={() => setModal(null)}>취소</OBtn><PBtn icon="check-bold" className="flex-[1.6]" pending={busy} disabled={transferPhone.replace(/\D/g, "").length < 10} onClick={doTransfer}>양도</PBtn></>}
        >
          <MemberStripe d={d} />
          <p className="mb-3.5 text-[12.5px] font-medium leading-relaxed text-[#766D60]">잔여 회차만 이전돼요. 정기 일정은 양도 후 따로 설정해주세요.</p>
          <ModalField label="양도받을 회원의 휴대폰 번호"><Input value={formatPhone(transferPhone)} onChange={(v) => setTransferPhone(v.replace(/\D/g, "").slice(0, 11))} placeholder="010-0000-0000" /></ModalField>
        </ConsoleModal>
      ) : null}
    </>
  );
}

/* ----- small shared pieces ----- */
function BadgePill({ badge }: { badge: MemberListItem["badge"] }) {
  if (badge.variant === "expiringNear" || badge.variant === "expiringSoon") {
    return <span style={pill("#B5612F", "#FBF3E9")}>{badge.text}</span>;
  }
  return <span style={pill("#5B6452", "#EDF4E3")}>{badge.text}</span>;
}

/** 등록 모달의 번호 섹션 헤더 — ①회원권 ②회원 정보 ③담당·결제 ④정기 요일. 첫 섹션 외에는 구분선 포함. */
function SectionHead({ no, title, hint }: { no: number; title: string; hint?: string }) {
  return (
    <div className={`mb-3 flex items-baseline gap-2 ${no === 1 ? "" : "mt-5 border-t border-[rgba(75,59,46,0.08)] pt-5"}`}>
      <span className="flex h-[21px] w-[21px] flex-none translate-y-[3px] items-center justify-center rounded-full bg-sage text-[11.5px] font-bold text-white">{no}</span>
      <span className="text-[14px] font-bold text-ink">{title}</span>
      {hint ? <span className="text-[11.5px] font-medium text-[#9A917F]">{hint}</span> : null}
    </div>
  );
}
function ModalField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-3.5">
      <div className="mb-[7px] text-[12px] font-semibold text-[#766D60]">{label}</div>
      {children}
    </div>
  );
}
function Input({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full rounded-[13px] border border-[rgba(75,59,46,0.14)] bg-[#FBF9F5] px-[15px] py-[13px] text-[14px] font-medium text-ink outline-none focus-visible:ring-2 focus-visible:ring-sage/40 placeholder:text-[#B3AA9C]"
    />
  );
}
function MethodPicker({ value, onChange }: { value: PaymentMethod; onChange: (m: PaymentMethod) => void }) {
  return (
    <div className="flex gap-2">
      {METHODS.map((m) => (
        <button key={m.v} onClick={() => onChange(m.v)} className={`flex-1 rounded-[11px] py-[11px] text-[13px] font-semibold transition ${value === m.v ? "bg-sage text-white" : "border border-[rgba(75,59,46,0.12)] bg-white text-[#766D60]"}`}>{m.l}</button>
      ))}
    </div>
  );
}
function ProductPicker({ products, selected, onPick, onClear, showPrice }: { products: MembershipProduct[]; selected: string; onPick: (id: string) => void; onClear: () => void; showPrice?: boolean }) {
  const [tab, setTab] = useState<Quad>("owner-1on1");
  const activeTab = QUAD_TABS.find((t) => t.key === tab)!;
  const shown = products.filter((p) => matchesQuad(p.name, activeTab) || isUnclassified(p.name));
  // 탭 변경으로 선택 상품이 숨겨지면 선택 해제 — 숨은 상품이 조용히 발급되는 것 방지.
  function pickTab(next: Quad) {
    setTab(next);
    const cur = products.find((p) => p.id === selected);
    const t = QUAD_TABS.find((q) => q.key === next)!;
    if (cur && !matchesQuad(cur.name, t) && !isUnclassified(cur.name)) onClear();
  }
  return (
    <div>
      {products.length > 0 ? (
        <div className="mb-2.5 flex items-center gap-[6px]">
          {QUAD_TABS.map((t) => {
            const on = tab === t.key;
            return (
              <button key={t.key} type="button" onClick={() => pickTab(t.key)} className={`rounded-[9px] px-3 py-[6px] text-[12px] font-semibold transition ${on ? "bg-sage text-white" : "bg-[#F4F0E8] text-[#766D60] hover:bg-[#ECE6DA]"}`}>
                {t.label}
              </button>
            );
          })}
        </div>
      ) : null}
      <div className="flex flex-col gap-2.5">
        {shown.map((p) => {
          const on = selected === p.id;
          return (
            <button key={p.id} onClick={() => onPick(p.id)} className={`rounded-[13px] border px-4 py-3 text-left transition ${on ? "border-sage bg-[#EDF4E3]" : "border-[rgba(75,59,46,0.12)] bg-white hover:bg-[#FBF9F5]"}`}>
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[14px] font-bold text-ink">{productShortLabel(p)}</span>
                    {isDiscountProduct(p.name) ? (
                      <span className="flex-none rounded-[6px] bg-[#F4EEE3] px-1.5 py-0.5 text-[10.5px] font-bold text-[#8A6F3E]">특별할인</span>
                    ) : null}
                    {!p.active ? (
                      <span className="flex-none rounded-[6px] bg-[#EFEBE3] px-1.5 py-0.5 text-[10.5px] font-bold text-[#8A8172]">단종 · 연장전용</span>
                    ) : null}
                  </div>
                  <div className="mt-0.5 text-[11px] font-medium text-[#9A917F]">{p.sessions}회 · 유효 {p.durationDays}일</div>
                </div>
                {showPrice ? <span className="flex-none text-[15px] font-bold text-ink">{won(p.price)}</span> : null}
              </div>
            </button>
          );
        })}
        {products.length === 0 ? <div className="text-[12.5px] font-medium text-[#A89F92]">등록된 상품이 없어요</div> : null}
        {products.length > 0 && shown.length === 0 ? <div className="text-[12.5px] font-medium text-[#A89F92]">이 분류에 상품이 없어요</div> : null}
      </div>
    </div>
  );
}
function MemberStripe({ d }: { d: MemberDetailView }) {
  return (
    <div className="mb-[18px] flex items-center gap-3 rounded-[14px] bg-[#FBF7F1] px-4 py-3.5">
      {d.isTeam && d.team ? <TeamAvatar team={d.team} size={44} /> : <Avatar initial={d.initial} tone={d.avatarTone} size={44} />}
      <div className="min-w-0 flex-1">
        <div className="text-[15px] font-bold text-ink">{d.name}</div>
        <div className="text-[11.5px] font-medium text-[#9A917F]">{d.activeMembershipId ? `${d.product} · 잔여 ${d.remaining}회` : "활성 회원권 없음"}</div>
      </div>
    </div>
  );
}
