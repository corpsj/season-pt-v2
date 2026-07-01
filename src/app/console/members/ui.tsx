"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/icon";
import { Avatar, TeamAvatar } from "@/components/ui/Avatar";
import { useToast } from "@/components/ui/Toast";
import { Card, PBtn, OBtn, DPill, ConsoleModal, MicroLabel, won, pill } from "@/components/console/ui";
import { loadMemberDetail, consoleIssueMembership } from "@/lib/data/groups/console-actions";
import { listMemberFiles } from "@/lib/data/groups/member-files-actions";
import type { MemberFileView } from "@/lib/data/groups/member-files";
import { extendMembership, previewRefund, refundMembership } from "@/lib/data/groups/membership-actions";
import { createMember, createMembersCsv } from "@/lib/data/groups/owner-ops-actions";
import { carryoverMembers } from "@/lib/data/groups/carryover-actions";
import { parseCarryoverCsv, type CarryRow } from "@/lib/import/carryover-parse";
import type { MemberDetailView, MemberListItem, MembershipProduct, Gender, PaymentMethod } from "@/lib/types";

const WD_LABEL = ["일", "월", "화", "수", "목", "금", "토"];

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
  initialId,
  initialDetail,
}: {
  items: MemberListItem[];
  statusById: Record<string, Status>;
  products: MembershipProduct[];
  initialId: string | null;
  initialDetail: MemberDetailView | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["key"]>("all");
  const [selectedId, setSelectedId] = useState(initialId);
  const [detail, setDetail] = useState(initialDetail);
  const [files, setFiles] = useState<MemberFileView[]>([]);
  const [, startLoad] = useTransition();
  const [modal, setModal] = useState<null | "add" | "csv" | "carry" | "issue" | "extend" | "refund">(null);
  const [busy, setBusy] = useState(false);
  const [csvRows, setCsvRows] = useState<CsvRow[] | null>(null);
  const [csvResult, setCsvResult] = useState<{ created: number; failed: { name: string; phone: string; error: string }[] } | null>(null);
  const [carryRows, setCarryRows] = useState<CarryRow[] | null>(null);
  const [carryResult, setCarryResult] = useState<{ created: number; failed: { name: string; error: string }[] } | null>(null);

  const [f, setF] = useState({ name: "", phone: "", birth: "", gender: "female" as Gender, productId: "", method: "card" as PaymentMethod });
  const [issueProduct, setIssueProduct] = useState("");
  const [issueMethod, setIssueMethod] = useState<PaymentMethod>("card");
  const [refund, setRefund] = useState<{ refund: number; used: number } | null>(null);
  const [refundMethod, setRefundMethod] = useState<PaymentMethod>("card");

  const query = q.trim();
  const list = items.filter(
    (m) => (filter === "all" || statusById[m.id] === filter) && (query === "" || m.name.includes(query) || m.sub.includes(query)),
  );

  function select(id: string) {
    setSelectedId(id);
    setFiles([]);
    startLoad(async () => {
      const [d, fs] = await Promise.all([loadMemberDetail(id), listMemberFiles(id)]);
      setDetail(d);
      setFiles(fs);
    });
  }
  async function reload() {
    if (selectedId) setDetail(await loadMemberDetail(selectedId));
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
    setRefund(null);
    setRefundMethod("card");
    setModal("refund");
    const p = (await previewRefund(detail.activeMembershipId)) as { ok: boolean; refund?: number; used?: number; error?: string };
    if (p.ok) setRefund({ refund: p.refund ?? 0, used: p.used ?? 0 });
  }
  async function doRefund() {
    if (!detail?.activeMembershipId) return;
    setBusy(true);
    const r = await refundMembership({ membershipId: detail.activeMembershipId, method: refundMethod });
    setBusy(false);
    if (!r.ok) return toast(r.error ?? "환불에 실패했어요");
    toast("환불을 처리했어요");
    setModal(null);
    await reload();
    router.refresh();
  }
  function openIssue() {
    setIssueProduct(products[0]?.id ?? "");
    setIssueMethod("card");
    setModal("issue");
  }
  async function doIssue() {
    if (!selectedId || !issueProduct) return;
    setBusy(true);
    const r = await consoleIssueMembership(selectedId, issueProduct, issueMethod);
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
    setBusy(true);
    const r = await createMember({
      name: f.name,
      phone: f.phone,
      birth: f.birth,
      gender: f.gender,
      slots: [],
      product: f.productId ? { productId: f.productId } : undefined,
      payment: f.productId ? { method: f.method } : undefined,
    });
    setBusy(false);
    if (!r.ok) return toast(r.error ?? "등록에 실패했어요");
    toast("회원을 등록했어요");
    setModal(null);
    setF({ name: "", phone: "", birth: "", gender: "female", productId: "", method: "card" });
    router.refresh();
    if (r.memberId) select(r.memberId);
  }

  function openCsv() {
    setCsvRows(null);
    setCsvResult(null);
    setModal("csv");
  }
  async function onCsvFile(file: File) {
    setCsvResult(null);
    setCsvRows(parseCsv(await file.text()));
  }
  async function doCsvAdd() {
    if (busy || !csvRows) return;
    const valid = csvRows.filter((r) => r.valid);
    if (valid.length === 0) return toast("등록할 유효한 회원이 없어요");
    setBusy(true);
    const r = await createMembersCsv(valid.map((v) => ({ name: v.name, phone: v.phone, birth: v.birth, gender: v.gender })));
    setBusy(false);
    if (!r.ok && r.error) return toast(r.error);
    setCsvResult({ created: r.created, failed: r.failed });
    router.refresh();
  }

  function openCarry() {
    setCarryRows(null);
    setCarryResult(null);
    setModal("carry");
  }
  async function onCarryFile(file: File) {
    setCarryResult(null);
    setCarryRows(parseCarryoverCsv(await file.text()));
  }
  async function doCarry() {
    if (busy || !carryRows) return;
    const valid = carryRows.filter((r) => r.valid);
    if (valid.length === 0) return toast("이관할 유효한 회원이 없어요");
    setBusy(true);
    const r = await carryoverMembers(
      valid.map((v) => ({ name: v.name, phone: v.phone, birth: v.birth, gender: v.gender, productName: v.productName, remaining: v.remaining, endDate: v.endDate, slots: v.slots, trainerName: v.trainerName })),
    );
    setBusy(false);
    if (!r.ok && r.error) return toast(r.error);
    setCarryResult({ created: r.created, failed: r.failed });
    router.refresh();
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
        <OBtn icon="refresh" className="ml-auto" onClick={openCarry}>기존 회원권 이관</OBtn>
        <OBtn icon="document-text" onClick={openCsv}>CSV 일괄 등록</OBtn>
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
              <div className="mb-[18px] grid grid-cols-2 gap-[9px]">
                <OBtn icon="calendar" disabled={!d.activeMembershipId} onClick={() => setModal("extend")}>기간 연장</OBtn>
                <OBtn icon="coins" disabled={!d.activeMembershipId} onClick={openRefund}>환불</OBtn>
                <PBtn icon="ticket-fill" className="col-span-2" onClick={openIssue}>회원권 발급</PBtn>
              </div>

              {/* body composition */}
              {d.body.weight > 0 ? (
                <>
                  <MicroLabel className="mb-2.5">체성분</MicroLabel>
                  <div className="mb-[18px] grid grid-cols-3 gap-2.5">
                    {[{ l: "체중", v: d.body.weight, u: "kg" }, { l: "골격근", v: d.body.skeletalMuscle, u: "kg" }, { l: "체지방", v: d.body.bodyFat, u: "%" }].map((b) => (
                      <div key={b.l} className="rounded-[14px] bg-[#FBF7F1] p-3.5">
                        <div className="mb-1 text-[11px] font-medium text-[#9A917F]">{b.l}</div>
                        <div><span className="serif text-[21px] font-semibold text-ink">{b.v}</span><span className="ml-0.5 text-[11px] font-medium text-[#9A917F]">{b.u}</span></div>
                      </div>
                    ))}
                  </div>
                </>
              ) : null}

              {d.injury ? (
                <div className="mb-[18px] flex items-start gap-2.5 rounded-[13px] bg-[#FBF3E9] px-4 py-3">
                  <Icon name="triangle-exclamation" size={16} className="mt-px flex-none text-terracotta" />
                  <span className="text-[12.5px] font-medium leading-relaxed text-[#9A8772]">{d.injury}</span>
                </div>
              ) : null}

              {files.length > 0 ? (
                <>
                  <MicroLabel className="mb-2.5">사진 · 인바디</MicroLabel>
                  <div className="mb-[18px] grid grid-cols-4 gap-2">
                    {files.map((f) =>
                      f.kind === "photo" ? (
                        f.url ? (
                          <a key={f.id} href={f.url} target="_blank" rel="noreferrer" className="aspect-square overflow-hidden rounded-[12px] bg-[#F1EDE6]">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={f.url} alt={f.takenAt} className="h-full w-full object-cover" />
                          </a>
                        ) : (
                          <div key={f.id} className="aspect-square rounded-[12px] bg-[#F1EDE6]" />
                        )
                      ) : (
                        <a key={f.id} href={f.url ?? undefined} target="_blank" rel="noreferrer" className="flex aspect-square flex-col items-center justify-center gap-1 rounded-[12px] bg-[#FBF7F1] text-center">
                          <Icon name="document-text" size={18} className="text-sage-deep" />
                          <span className="text-[10px] font-semibold text-[#766D60]">인바디</span>
                        </a>
                      ),
                    )}
                  </div>
                </>
              ) : null}

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
          <ProductPicker products={products} selected={f.productId} onPick={(id) => setF({ ...f, productId: f.productId === id ? "" : id })} />
          {f.productId ? (
            <div className="mt-3">
              <div className="mb-2 text-[11.5px] font-semibold text-[#9A917F]">결제 수단</div>
              <MethodPicker value={f.method} onChange={(m) => setF({ ...f, method: m })} />
            </div>
          ) : null}
        </ConsoleModal>
      ) : null}

      {modal === "csv" ? (
        <ConsoleModal
          title="CSV 일괄 등록"
          width={460}
          onClose={() => setModal(null)}
          footer={
            csvResult ? (
              <PBtn icon="check-bold" className="flex-1" onClick={() => setModal(null)}>완료</PBtn>
            ) : (
              <>
                <OBtn className="flex-1" onClick={() => setModal(null)}>취소</OBtn>
                <PBtn icon="check-bold" className="flex-[1.6]" disabled={busy || !csvRows?.some((r) => r.valid)} onClick={doCsvAdd}>
                  {csvRows ? `${csvRows.filter((r) => r.valid).length}명 등록` : "등록"}
                </PBtn>
              </>
            )
          }
        >
          {csvResult ? (
            <div>
              <div className="mb-4 rounded-[14px] bg-[#EDF4E3] px-[18px] py-4 text-center">
                <div className="text-[13px] font-medium text-[#5B6452]">등록 완료</div>
                <div className="mt-0.5 text-[26px] font-bold text-sage-deep">{csvResult.created}명</div>
              </div>
              {csvResult.failed.length > 0 ? (
                <>
                  <div className="mb-2 text-[11.5px] font-semibold text-[#9A917F]">실패 {csvResult.failed.length}건</div>
                  <div className="flex flex-col gap-1.5">
                    {csvResult.failed.map((fr, i) => (
                      <div key={i} className="flex items-center gap-2 rounded-[11px] bg-[#FBF3E9] px-3.5 py-2.5">
                        <Icon name="triangle-exclamation" size={15} className="flex-none text-terracotta" />
                        <span className="flex-1 truncate text-[12.5px] font-semibold text-[#5B5345]">{fr.name || fr.phone}</span>
                        <span className="text-[11.5px] font-medium text-[#9A8772]">{fr.error}</span>
                      </div>
                    ))}
                  </div>
                </>
              ) : null}
            </div>
          ) : (
            <div>
              <label className="flex cursor-pointer flex-col items-center gap-2 rounded-[14px] border-[1.4px] border-dashed border-[rgba(75,59,46,0.22)] bg-[#FBF9F5] px-5 py-7 text-center transition hover:bg-[#F4F0E8]">
                <Icon name="document-text" size={26} className="text-[#A89F92]" />
                <span className="text-[13.5px] font-semibold text-[#766D60]">CSV 파일 선택</span>
                <input type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onCsvFile(f); }} />
              </label>
              <div className="mt-3 flex items-start gap-2.5 rounded-[13px] bg-[#F8F4EC] px-4 py-3">
                <Icon name="circle-info" size={16} className="mt-px flex-none text-[#A89F92]" />
                <span className="text-[12px] font-medium leading-relaxed text-[#766D60]">
                  열 순서: <b className="font-semibold text-[#5B5345]">이름, 연락처, 생년월일(YYMMDD), 성별</b>. 첫 행이 머리글이면 자동으로 건너뛰어요. 엑셀은 <b className="font-semibold text-[#5B5345]">CSV UTF-8</b>로 저장하세요.{" "}
                  <button onClick={downloadCsvTemplate} className="font-semibold text-sage-deep underline underline-offset-2">양식 내려받기</button>
                </span>
              </div>
              {csvRows ? (
                <div className="mt-4">
                  <div className="mb-2 text-[11.5px] font-semibold text-[#9A917F]">
                    총 {csvRows.length}명 · <span className="text-sage-deep">유효 {csvRows.filter((r) => r.valid).length}명</span>
                    {csvRows.some((r) => !r.valid) ? <span className="text-terracotta"> · 오류 {csvRows.filter((r) => !r.valid).length}명</span> : null}
                  </div>
                  <div className="flex max-h-[230px] flex-col gap-1.5 overflow-y-auto">
                    {csvRows.map((r, i) => (
                      <div key={i} className={`flex items-center gap-2 rounded-[11px] px-3.5 py-2.5 ${r.valid ? "bg-[#FBF7F1]" : "bg-[#FBF3E9]"}`}>
                        <Icon name={r.valid ? "circle-check" : "triangle-exclamation"} size={15} className={`flex-none ${r.valid ? "text-sage-deep" : "text-terracotta"}`} />
                        <span className="w-[68px] flex-none truncate text-[12.5px] font-semibold text-[#5B5345]">{r.name || "—"}</span>
                        <span className="flex-1 truncate text-[12px] font-medium text-[#9A917F]">{r.phone}</span>
                        <span className="text-[11.5px] font-medium text-[#9A8772]">{r.valid ? (r.gender === "male" ? "남" : "여") : r.reason}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </ConsoleModal>
      ) : null}

      {modal === "carry" ? (
        <ConsoleModal
          title="기존 회원권 이관"
          width={520}
          onClose={() => setModal(null)}
          footer={
            carryResult ? (
              <PBtn icon="check-bold" className="flex-1" onClick={() => setModal(null)}>완료</PBtn>
            ) : (
              <>
                <OBtn className="flex-1" onClick={() => setModal(null)}>취소</OBtn>
                <PBtn icon="check-bold" className="flex-[1.6]" disabled={busy || !carryRows?.some((r) => r.valid)} onClick={doCarry}>
                  {carryRows ? `${carryRows.filter((r) => r.valid).length}명 이관` : "이관"}
                </PBtn>
              </>
            )
          }
        >
          {carryResult ? (
            <div>
              <div className="mb-4 rounded-[14px] bg-[#EDF4E3] px-[18px] py-4 text-center">
                <div className="text-[13px] font-medium text-[#5B6452]">이관 완료</div>
                <div className="mt-0.5 text-[26px] font-bold text-sage-deep">{carryResult.created}명</div>
              </div>
              {carryResult.failed.length > 0 ? (
                <>
                  <div className="mb-2 text-[11.5px] font-semibold text-[#9A917F]">실패 {carryResult.failed.length}건</div>
                  <div className="flex flex-col gap-1.5">
                    {carryResult.failed.map((fr, i) => (
                      <div key={i} className="flex items-center gap-2 rounded-[11px] bg-[#FBF3E9] px-3.5 py-2.5">
                        <Icon name="triangle-exclamation" size={15} className="flex-none text-terracotta" />
                        <span className="flex-1 truncate text-[12.5px] font-semibold text-[#5B5345]">{fr.name}</span>
                        <span className="text-[11.5px] font-medium text-[#9A8772]">{fr.error}</span>
                      </div>
                    ))}
                  </div>
                </>
              ) : null}
            </div>
          ) : (
            <div>
              <label className="flex cursor-pointer flex-col items-center gap-2 rounded-[14px] border-[1.4px] border-dashed border-[rgba(75,59,46,0.22)] bg-[#FBF9F5] px-5 py-7 text-center transition hover:bg-[#F4F0E8]">
                <Icon name="refresh" size={24} className="text-[#A89F92]" />
                <span className="text-[13.5px] font-semibold text-[#766D60]">이관 CSV 파일 선택</span>
                <input type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onCarryFile(f); }} />
              </label>
              <div className="mt-3 flex items-start gap-2.5 rounded-[13px] bg-[#F8F4EC] px-4 py-3">
                <Icon name="circle-info" size={16} className="mt-px flex-none text-[#A89F92]" />
                <span className="text-[12px] font-medium leading-relaxed text-[#766D60]">
                  열: <b className="font-semibold text-[#5B5345]">이름, 연락처, 생년월일, 성별, 상품명, 잔여횟수, 만료일, 정기일정, 담당강사</b>. 상품명은 <b className="font-semibold text-[#5B5345]">미리 등록한 회원권 상품</b>과 정확히 같아야 해요(설정에서 먼저 등록). 결제는 기록되지 않아 매출에 잡히지 않아요.{" "}
                  <button onClick={downloadCarryTemplate} className="font-semibold text-sage-deep underline underline-offset-2">양식 내려받기</button>
                </span>
              </div>
              {carryRows ? (
                <div className="mt-4">
                  <div className="mb-2 text-[11.5px] font-semibold text-[#9A917F]">
                    총 {carryRows.length}명 · <span className="text-sage-deep">유효 {carryRows.filter((r) => r.valid).length}명</span>
                    {carryRows.some((r) => !r.valid) ? <span className="text-terracotta"> · 오류 {carryRows.filter((r) => !r.valid).length}명</span> : null}
                  </div>
                  <div className="flex max-h-[240px] flex-col gap-1.5 overflow-y-auto">
                    {carryRows.map((r, i) => (
                      <div key={i} className={`flex items-center gap-2 rounded-[11px] px-3.5 py-2.5 ${r.valid ? "bg-[#FBF7F1]" : "bg-[#FBF3E9]"}`}>
                        <Icon name={r.valid ? "circle-check" : "triangle-exclamation"} size={15} className={`flex-none ${r.valid ? "text-sage-deep" : "text-terracotta"}`} />
                        <span className="w-[64px] flex-none truncate text-[12.5px] font-semibold text-[#5B5345]">{r.name || "—"}</span>
                        {r.valid ? (
                          <>
                            <span className="flex-1 truncate text-[12px] font-medium text-[#9A917F]">{r.productName} · 잔여 {r.remaining}</span>
                            <span className="text-[11.5px] font-medium text-[#9A8772]">~{r.endDate.slice(2).replace(/-/g, ".")} · {r.slots.map((s) => `${WD_LABEL[s.weekday]}${s.hour}${s.minute ? ":30" : ""}`).join(" ") || "일정없음"}</span>
                          </>
                        ) : (
                          <span className="flex-1 truncate text-[11.5px] font-medium text-[#9A8772]">{r.reason}</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </ConsoleModal>
      ) : null}

      {modal === "issue" && d ? (
        <ConsoleModal
          title="회원권 발급"
          onClose={() => setModal(null)}
          footer={<><OBtn className="flex-1" onClick={() => setModal(null)}>취소</OBtn><PBtn icon="check-bold" className="flex-[1.6]" disabled={busy || !issueProduct} onClick={doIssue}>발급</PBtn></>}
        >
          <MemberStripe d={d} />
          <div className="mb-2.5 text-[11.5px] font-semibold text-[#9A917F]">회원권 상품</div>
          <ProductPicker products={products} selected={issueProduct} onPick={setIssueProduct} showPrice />
          <div className="mb-2 mt-3 text-[11.5px] font-semibold text-[#9A917F]">결제 수단</div>
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
          footer={<><OBtn className="flex-1" onClick={() => setModal(null)}>취소</OBtn><PBtn icon="check-bold" className="flex-[1.6]" disabled={busy || !refund} onClick={doRefund}>환불 처리</PBtn></>}
        >
          <MemberStripe d={d} />
          <div className="mb-[18px] rounded-[14px] bg-[#FBF3E9] px-[18px] py-4">
            <div className="mb-1.5 text-[12px] font-medium text-[#9A8772]">환불 예정 금액 · 사용 {refund ? refund.used : "…"}회</div>
            <div className="text-[26px] font-bold text-terracotta">{refund ? won(refund.refund) : "계산 중…"}</div>
          </div>
          <div className="mb-2 text-[11.5px] font-semibold text-[#9A917F]">환불 수단</div>
          <MethodPicker value={refundMethod} onChange={setRefundMethod} />
          <div className="mt-4 flex items-start gap-2.5 rounded-[13px] bg-[#F8F4EC] px-4 py-3"><Icon name="circle-info" size={16} className="mt-px flex-none text-[#A89F92]" /><span className="text-[12px] font-medium leading-relaxed text-[#766D60]">환불 시 회원권은 즉시 종료되고 매출 내역에 기록돼요.</span></div>
        </ConsoleModal>
      ) : null}
    </>
  );
}

/* ----- CSV bulk register ----- */
type CsvRow = { name: string; phone: string; birth: string; gender: Gender; valid: boolean; reason?: string };

/** 열 순서: 이름,연락처,생년월일(YYMMDD),성별. 헤더 행은 자동 감지해 건너뛴다. */
function parseCsv(text: string): CsvRow[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return [];
  const body = /이름|name|연락처|phone/i.test(lines[0]) ? lines.slice(1) : lines;
  return body.map((line) => {
    const [name = "", phone = "", birth = "", gender = ""] = line.split(",").map((c) => c.trim());
    const g: Gender = /남|^m/i.test(gender) ? "male" : "female";
    let reason: string | undefined;
    if (!name) reason = "이름 없음";
    else if (phone.replace(/\D/g, "").length < 9) reason = "연락처 오류";
    else if (birth.replace(/\D/g, "").length !== 6) reason = "생년월일 6자리 아님";
    return { name, phone, birth, gender: g, valid: !reason, reason };
  });
}

/** UTF-8 BOM 포함 → 엑셀에서 한글 깨짐 방지. */
function downloadCsvTemplate() {
  const csv = "이름,연락처,생년월일,성별\n홍길동,010-1234-5678,920101,남\n김영희,010-2345-6789,950312,여\n";
  const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = "회원등록_양식.csv";
  a.click();
  URL.revokeObjectURL(url);
}

function downloadCarryTemplate() {
  const csv =
    "이름,연락처,생년월일,성별,상품명,잔여횟수,만료일,정기일정,담당강사\n" +
    "김서연,010-1234-5678,920101,여,1:1 PT 20회권,7,2026-08-31,월 19:00 / 수 19:00,박지훈\n" +
    "박민수,010-2222-3333,880303,남,1:1 PT 10회권,3,2026-07-15,화 07:00,\n";
  const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = "회원권이관_양식.csv";
  a.click();
  URL.revokeObjectURL(url);
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
function MethodPicker({ value, onChange }: { value: PaymentMethod; onChange: (m: PaymentMethod) => void }) {
  return (
    <div className="flex gap-2">
      {METHODS.map((m) => (
        <button key={m.v} onClick={() => onChange(m.v)} className={`flex-1 rounded-[11px] py-[11px] text-[13px] font-semibold transition ${value === m.v ? "bg-sage text-white" : "border border-[rgba(75,59,46,0.12)] bg-white text-[#766D60]"}`}>{m.l}</button>
      ))}
    </div>
  );
}
function ProductPicker({ products, selected, onPick, showPrice }: { products: MembershipProduct[]; selected: string; onPick: (id: string) => void; showPrice?: boolean }) {
  return (
    <div className="flex flex-col gap-2.5">
      {products.map((p) => {
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
