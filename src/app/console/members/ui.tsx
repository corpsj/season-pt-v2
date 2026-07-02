"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/icon";
import { Avatar, TeamAvatar } from "@/components/ui/Avatar";
import { useToast } from "@/components/ui/Toast";
import { Card, PBtn, OBtn, DPill, ConsoleModal, MicroLabel, won, pill } from "@/components/console/ui";
import { loadMemberDetail, consoleIssueMembership } from "@/lib/data/groups/console-actions";
import { listMemberFiles } from "@/lib/data/groups/member-files-actions";
import { listMemberMeals } from "@/lib/data/groups/meals-actions";
import type { MemberFileView } from "@/lib/data/groups/member-files";
import type { MealLog } from "@/lib/data/groups/meals";
import { extendMembership, previewRefund, refundMembership } from "@/lib/data/groups/membership-actions";
import { createMember } from "@/lib/data/groups/owner-ops-actions";
import { productType, tierMatches, isDiscountProduct } from "@/lib/data/product-class";
import { BulkAddModal, type TrainerOpt } from "./bulk";
import { BodyRecordSection, MealsSection } from "./BodyMeals";
import { ScheduleEditModal } from "./ScheduleEditor";
import { TeamCreateModal, TeamEditModal } from "./TeamCreate";
import type { MemberDetailView, MemberListItem, MembershipProduct, Gender, PaymentMethod, DiscountItem } from "@/lib/types";

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

export function MembersClient({
  items,
  statusById,
  products,
  trainers,
  discounts,
  initialId,
  initialDetail,
  initialFiles,
  initialMeals,
}: {
  items: MemberListItem[];
  statusById: Record<string, Status>;
  products: MembershipProduct[];
  trainers: TrainerOpt[];
  discounts: DiscountItem[];
  initialId: string | null;
  initialDetail: MemberDetailView | null;
  initialFiles: MemberFileView[];
  initialMeals: MealLog[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["key"]>("all");
  const [selectedId, setSelectedId] = useState(initialId);
  const [detail, setDetail] = useState(initialDetail);
  const [files, setFiles] = useState<MemberFileView[]>(initialFiles);
  const [meals, setMeals] = useState<MealLog[]>(initialMeals);
  const [, startLoad] = useTransition();
  const [modal, setModal] = useState<null | "add" | "bulk" | "issue" | "extend" | "refund" | "schedule" | "team">(null);
  const [busy, setBusy] = useState(false);

  const [f, setF] = useState({ name: "", phone: "", birth: "", gender: "female" as Gender, productId: "", method: "card" as PaymentMethod, amount: "", discountId: "" });
  const [issueProduct, setIssueProduct] = useState("");
  const [issueMethod, setIssueMethod] = useState<PaymentMethod>("card");
  const [issueAmt, setIssueAmt] = useState("");
  const [issueDiscountId, setIssueDiscountId] = useState("");
  // 결제 금액은 상품 가격 그대로(할인은 특별할인 상품이 담당 — 금액 차감 없음).
  // 자격 있으면 특별할인 상품만, 없으면 특별할인 상품 숨김 — 담당 필터와 AND.
  const productMatches = (name: string, trainerIsOwner: boolean, qualified: boolean) =>
    tierMatches(name, trainerIsOwner) && isDiscountProduct(name) === qualified;
  const [refund, setRefund] = useState<{ refund: number; used: number; noBaseline: boolean } | null>(null);
  const [refundMethod, setRefundMethod] = useState<PaymentMethod>("card");
  const [refundAmt, setRefundAmt] = useState("");
  const [refundErr, setRefundErr] = useState<string | null>(null);

  const query = q.trim();
  const list = items.filter(
    (m) => (filter === "all" || statusById[m.id] === filter) && (query === "" || m.name.includes(query) || m.sub.includes(query)),
  );

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
    if (!r.ok) return toast(r.error ?? "연장에 실패했어요");
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
    if (refundAmt === "" || !Number.isInteger(n) || n < 0) return toast("환불 금액을 확인해주세요");
    setBusy(true);
    const r = await refundMembership({ membershipId: detail.activeMembershipId, method: refundMethod, amountOverride: n });
    setBusy(false);
    if (!r.ok) return toast(r.error ?? "환불에 실패했어요");
    toast("환불을 처리했어요");
    setModal(null);
    await reload();
    router.refresh();
  }
  function openIssue() {
    const owner = detail?.trainerIsOwner ?? true;
    // 회원의 할인 자격을 기본 선택(변경 가능). 담당 + 자격에 맞는 첫 상품만 기본 선택 —
    // 숨겨진 상품이 조용히 발급되는 것 방지(자격 있는데 특별할인 상품 0개면 미선택 → "전체 상품 보기").
    const discId = detail?.discount?.id ?? "";
    const first = products.find((p) => productMatches(p.name, owner, discId !== ""));
    setIssueProduct(first?.id ?? "");
    setIssueDiscountId(discId);
    setIssueAmt(first ? String(first.price) : "");
    setIssueMethod("card");
    setModal("issue");
  }
  async function doIssue() {
    if (!selectedId || !issueProduct) return;
    const amt = Number(issueAmt);
    if (!Number.isInteger(amt) || amt <= 0) return toast("결제 금액을 확인해주세요");
    const disc = discounts.find((x) => x.id === issueDiscountId) ?? (detail?.discount?.id === issueDiscountId ? detail.discount : null);
    const discountLabel = disc ? disc.name : undefined;
    setBusy(true);
    const r = await consoleIssueMembership(selectedId, issueProduct, issueMethod, amt, discountLabel);
    setBusy(false);
    if (!r.ok) return toast(r.error ?? "발급에 실패했어요");
    toast("회원권을 발급했어요");
    setModal(null);
    await reload();
    router.refresh();
  }
  async function doAdd() {
    if (busy) return;
    if (!f.name.trim() || !f.phone.trim() || f.birth.replace(/\D/g, "").length !== 6) return toast("이름·연락처·생년월일(6자리)을 입력해주세요");
    if (f.productId) {
      const amt = Number(f.amount);
      if (!Number.isInteger(amt) || amt <= 0) return toast("결제 금액을 확인해주세요");
    }
    setBusy(true);
    const r = await createMember({
      name: f.name,
      phone: f.phone,
      birth: f.birth,
      gender: f.gender,
      slots: [],
      discountId: f.discountId || undefined, // 회원 속성 저장 + 발급 결제 라벨 스냅샷(서버가 합성)
      product: f.productId ? { productId: f.productId } : undefined,
      payment: f.productId ? { method: f.method, amount: Number(f.amount) } : undefined,
    });
    setBusy(false);
    if (!r.ok) return toast(r.error ?? "등록에 실패했어요");
    toast("회원을 등록했어요");
    setModal(null);
    setF({ name: "", phone: "", birth: "", gender: "female", productId: "", method: "card", amount: "", discountId: "" });
    router.refresh();
    if (r.memberId) select(r.memberId);
  }

  const d = detail;

  return (
    <>
      {/* toolbar */}
      <div className="mb-5 flex items-center gap-3">
        <div className="flex max-w-[380px] flex-1 items-center gap-2.5 rounded-[13px] border border-[rgba(75,59,46,0.1)] bg-white px-[15px] py-[11px]">
          <Icon name="search" size={18} className="text-[#A89F92]" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="이름 검색" className="w-full bg-transparent text-[14px] font-medium text-ink outline-none placeholder:text-[#B3AA9C]" />
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
        <PBtn icon="person-plus" onClick={() => setModal("add")}>회원 등록</PBtn>
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
                  <span className="w-[60px] text-right"><DPill dDay={dDayFromBadge(m)} /></span>
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
                  </div>
                  <div className="mt-0.5 truncate text-[13px] font-medium text-[#847A66]">{d.schedule}</div>
                </div>
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
              <div className="mb-3 grid grid-cols-3 gap-[9px]">
                <OBtn icon="calendar" className="whitespace-nowrap !px-2" disabled={!d.activeMembershipId} onClick={() => setModal("extend")}>기간 연장</OBtn>
                <OBtn icon="coins" className="whitespace-nowrap !px-2" disabled={!d.activeMembershipId} onClick={openRefund}>환불</OBtn>
                <PBtn className="whitespace-nowrap !px-2" onClick={openIssue}>회원권 발급</PBtn>
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
          footer={<><OBtn className="flex-1" onClick={() => setModal(null)}>취소</OBtn><PBtn icon="check-bold" className="flex-[1.6]" onClick={doAdd}>등록</PBtn></>}
        >
          <ModalField label="이름"><Input value={f.name} onChange={(v) => setF({ ...f, name: v })} placeholder="회원 이름" /></ModalField>
          <ModalField label="연락처"><Input value={f.phone} onChange={(v) => setF({ ...f, phone: v })} placeholder="010-0000-0000" /></ModalField>
          <div className="grid grid-cols-2 gap-2.5">
            <ModalField label="생년월일 (6자리)"><Input value={f.birth} onChange={(v) => setF({ ...f, birth: v })} placeholder="YYMMDD" /></ModalField>
            <ModalField label="성별">
              <div className="flex gap-2">
                {([["female", "여성"], ["male", "남성"]] as const).map(([g, l]) => (
                  <button key={g} onClick={() => setF({ ...f, gender: g })} className={`flex-1 rounded-[12px] py-[11px] text-[13.5px] font-semibold transition ${f.gender === g ? "bg-sage text-white" : "border border-[rgba(75,59,46,0.14)] bg-[#FBF9F5] text-[#766D60]"}`}>{l}</button>
                ))}
              </div>
            </ModalField>
          </div>
          <div className="mb-2 mt-1 text-[11.5px] font-semibold text-[#9A917F]">회원권 (선택)</div>
          {/* 콘솔 등록은 담당이 대표로 배정되므로 대표+공용 상품 기본 노출 */}
          <ProductPicker
            products={products}
            selected={f.productId}
            showPrice
            trainerIsOwner={true}
            qualified={f.discountId !== ""}
            onPick={(id) => {
              const newId = f.productId === id ? "" : id;
              const p = products.find((pp) => pp.id === newId);
              setF({ ...f, productId: newId, amount: p ? String(p.price) : f.amount });
            }}
          />
          {discounts.length > 0 ? (
            <div className="mt-3">
              <div className="mb-2 text-[11.5px] font-semibold text-[#9A917F]">특별 할인 자격</div>
              <DiscountSelect
                discounts={discounts}
                value={f.discountId}
                onChange={(id) => {
                  // 자격 변경 시 상품 필터가 바뀐다 — 선택 상품이 숨겨지면 해제(상품은 선택).
                  const cur = products.find((pp) => pp.id === f.productId);
                  const keep = cur && productMatches(cur.name, true, id !== "");
                  setF({ ...f, discountId: id, productId: keep ? f.productId : "", amount: keep ? f.amount : "" });
                }}
              />
            </div>
          ) : null}
          {f.productId ? (
            <div className="mt-3">
              <div className="mb-2 text-[11.5px] font-semibold text-[#9A917F]">결제 금액</div>
              <input
                value={f.amount}
                onChange={(e) => setF({ ...f, amount: e.target.value.replace(/\D/g, "") })}
                inputMode="numeric"
                placeholder="₩ 금액"
                className="mb-3.5 w-full rounded-[12px] border border-[rgba(75,59,46,0.14)] bg-[#FBF9F5] px-[15px] py-[12px] text-[14px] font-medium text-ink outline-none placeholder:text-[#B3AA9C]"
              />
              <div className="mb-2 text-[11.5px] font-semibold text-[#9A917F]">결제 수단</div>
              <MethodPicker value={f.method} onChange={(m) => setF({ ...f, method: m })} />
            </div>
          ) : null}
        </ConsoleModal>
      ) : null}

      {modal === "bulk" ? (
        <BulkAddModal
          products={products}
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
          footer={<><OBtn className="flex-1" onClick={() => setModal(null)}>취소</OBtn><PBtn icon="check-bold" className="flex-[1.6]" disabled={busy || !issueProduct} onClick={doIssue}>발급</PBtn></>}
        >
          <MemberStripe d={d} />
          <div className="mb-2.5 text-[11.5px] font-semibold text-[#9A917F]">회원권 상품</div>
          <ProductPicker
            products={products}
            selected={issueProduct}
            trainerIsOwner={d.trainerIsOwner ?? true}
            qualified={issueDiscountId !== ""}
            onPick={(id) => {
              setIssueProduct(id);
              const p = products.find((pp) => pp.id === id);
              if (p) setIssueAmt(String(p.price));
            }}
            showPrice
          />
          {discounts.length > 0 || d.discount ? (
            <>
              <div className="mb-2 mt-3 text-[11.5px] font-semibold text-[#9A917F]">특별 할인 자격</div>
              <DiscountSelect
                discounts={discounts}
                storedDiscount={d.discount}
                value={issueDiscountId}
                onChange={(id) => {
                  setIssueDiscountId(id);
                  // 자격 변경으로 상품 필터가 바뀐다 — 선택 상품이 숨겨지면 담당+자격에 맞는 첫 상품으로 재선택.
                  const owner = d.trainerIsOwner ?? true;
                  const cur = products.find((pp) => pp.id === issueProduct);
                  const next = cur && productMatches(cur.name, owner, id !== "") ? cur : products.find((pp) => productMatches(pp.name, owner, id !== ""));
                  setIssueProduct(next?.id ?? "");
                  setIssueAmt(next ? String(next.price) : "");
                }}
              />
            </>
          ) : null}
          <div className="mb-2 mt-3 text-[11.5px] font-semibold text-[#9A917F]">결제 금액</div>
          <input
            value={issueAmt}
            onChange={(e) => setIssueAmt(e.target.value.replace(/\D/g, ""))}
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
          footer={<><OBtn className="flex-1" onClick={() => setModal(null)}>취소</OBtn><PBtn icon="check-bold" className="flex-[1.6]" disabled={busy} onClick={doExtend}>연장</PBtn></>}
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
          footer={<><OBtn className="flex-1" onClick={() => setModal(null)}>취소</OBtn><PBtn icon="check-bold" className="flex-[1.6]" disabled={busy || refundAmt === ""} onClick={doRefund}>환불 처리</PBtn></>}
        >
          <MemberStripe d={d} />
          <div className="mb-[18px] rounded-[14px] bg-[#FBF3E9] px-[18px] py-4">
            {refundErr ? <div className="mb-1.5 text-[13px] font-medium text-terracotta">{refundErr}</div> : null}
            <div className="mb-1.5 text-[12px] font-medium text-[#9A8772]">
              {refund ? `산식 기준 ${won(refund.refund)} · 사용 ${refund.used}회${refund.noBaseline ? " · 결제 기록 없음(이관)" : ""}` : refundErr ? "" : "계산 중…"}
            </div>
            <input
              value={refundAmt}
              onChange={(e) => setRefundAmt(e.target.value.replace(/\D/g, ""))}
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
    </>
  );
}

/* ----- small shared pieces ----- */
function dDayFromBadge(m: MemberListItem): number | null {
  // list badge text is "D-N" or "활성"; convert for the trailing pill
  const t = m.badge.text;
  if (t.startsWith("D-")) return Number(t.slice(2));
  return 9999; // not expiring → renders a calm sage pill via DPill (>14)
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
function DiscountSelect({ discounts, value, onChange, storedDiscount }: { discounts: DiscountItem[]; value: string; onChange: (id: string) => void; storedDiscount?: { id: string; name: string } | null }) {
  // 회원 저장 할인이 비활성 프리셋이면 목록에 없으므로 병합해 선택 유지.
  const extra = storedDiscount && !discounts.some((d) => d.id === storedDiscount.id) ? [storedDiscount] : [];
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-[13px] border border-[rgba(75,59,46,0.14)] bg-[#FBF9F5] px-[15px] py-[12px] text-[14px] font-medium text-ink outline-none focus-visible:ring-2 focus-visible:ring-sage/40"
    >
      <option value="">할인 없음</option>
      {[...discounts, ...extra].map((d) => (
        <option key={d.id} value={d.id}>{d.name}</option>
      ))}
    </select>
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
type ProductFilter = "all" | "1on1" | "2on1";
const PRODUCT_FILTERS: { key: ProductFilter; label: string }[] = [
  { key: "all", label: "전체" },
  { key: "1on1", label: "1:1" },
  { key: "2on1", label: "2:1" },
];
function ProductPicker({ products, selected, onPick, showPrice, trainerIsOwner, qualified }: { products: MembershipProduct[]; selected: string; onPick: (id: string) => void; showPrice?: boolean; trainerIsOwner?: boolean; qualified?: boolean }) {
  const [filter, setFilter] = useState<ProductFilter>("all");
  // 담당(대표/강사) + 할인 자격 자동 필터 — 자격 있으면 특별할인 상품만·없으면 숨김. "전체 상품 보기"로 둘 다 해제.
  const [allTiers, setAllTiers] = useState(false);
  const tierVisible = allTiers
    ? products
    : products.filter(
        (p) =>
          (trainerIsOwner == null || tierMatches(p.name, trainerIsOwner)) &&
          (qualified == null || isDiscountProduct(p.name) === qualified),
      );
  const shown = filter === "all" ? tierVisible : tierVisible.filter((p) => productType(p.name) === filter);
  return (
    <div>
      {products.length > 0 ? (
        <div className="mb-2.5 flex items-center gap-[6px]">
          {PRODUCT_FILTERS.map((f) => {
            const on = filter === f.key;
            return (
              <button key={f.key} type="button" onClick={() => setFilter(f.key)} className={`rounded-[9px] px-3 py-[6px] text-[12px] font-semibold transition ${on ? "bg-sage text-white" : "bg-[#F4F0E8] text-[#766D60] hover:bg-[#ECE6DA]"}`}>
                {f.label}
              </button>
            );
          })}
          {trainerIsOwner != null && (tierVisible.length !== products.length || allTiers) ? (
            <button type="button" onClick={() => setAllTiers((v) => !v)} className="ml-auto text-[11.5px] font-semibold text-[#9A917F] underline underline-offset-2 hover:text-ink">
              {allTiers ? `${trainerIsOwner ? "대표" : "강사"} 상품만` : "전체 상품 보기"}
            </button>
          ) : null}
        </div>
      ) : null}
      <div className="flex flex-col gap-2.5">
        {shown.map((p) => {
          const on = selected === p.id;
          return (
            <button key={p.id} onClick={() => onPick(p.id)} className={`rounded-[13px] border px-4 py-3 text-left transition ${on ? "border-sage bg-[#EDF4E3]" : "border-[rgba(75,59,46,0.12)] bg-white hover:bg-[#FBF9F5]"}`}>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[14px] font-bold text-ink">{p.name}</div>
                  <div className="mt-0.5 text-[11px] font-medium text-[#9A917F]">{p.sessions}회 · 유효 {p.durationDays}일</div>
                </div>
                {showPrice ? <span className="text-[15px] font-bold text-ink">{won(p.price)}</span> : null}
              </div>
            </button>
          );
        })}
        {products.length === 0 ? <div className="text-[12.5px] font-medium text-[#A89F92]">등록된 상품이 없어요</div> : null}
        {products.length > 0 && shown.length === 0 ? <div className="text-[12.5px] font-medium text-[#A89F92]">해당하는 상품이 없어요</div> : null}
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
