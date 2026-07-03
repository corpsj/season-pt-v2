"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/Toast";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { PBtn, OBtn, ConsoleModal, won } from "@/components/console/ui";
import { addInstructor, issueInstructorLogin, updateInstructor, setInstructorActive, deleteInstructor, resetInstructorPassword } from "@/lib/auth/trainer-actions";
import { setTrainerRates } from "@/lib/data/groups/settlement-actions";
import { formatPhone } from "@/components/ui/Field";

function Input({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full rounded-[12px] border border-[rgba(75,59,46,0.14)] bg-[#FBF9F5] px-[15px] py-[13px] text-[14px] font-medium text-ink outline-none placeholder:text-[#B3AA9C]"
    />
  );
}
function Label({ children }: { children: React.ReactNode }) {
  return <div className="mb-[7px] mt-3.5 text-[12px] font-semibold text-[#766D60] first:mt-0">{children}</div>;
}

export function AddTrainerButton() {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");

  async function submit() {
    if (busy) return;
    if (!name.trim()) return toast("강사 이름을 입력해주세요", "error");
    setBusy(true);
    const r = await addInstructor(name, phone);
    setBusy(false);
    if (!r.ok) return toast(r.error ?? "등록에 실패했어요", "error");
    toast("강사를 등록했어요");
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <PBtn icon="person-plus" className="flex-none !px-5" onClick={() => { setName(""); setPhone(""); setOpen(true); }}>강사 추가</PBtn>
      {open ? (
        <ConsoleModal
          title="강사 추가"
          onClose={() => setOpen(false)}
          footer={
            <><OBtn className="flex-1" onClick={() => setOpen(false)}>취소</OBtn><PBtn icon="person-plus" className="flex-[1.6]" pending={busy} onClick={submit}>강사 등록</PBtn></>
          }
        >
          <p className="mb-3 text-[13px] leading-relaxed text-[#8A8175]">이름만 등록하면 바로 회원의 담당 강사로 지정할 수 있어요. 로그인 아이디는 준비되면 강사 상세에서 발급하세요.</p>
          <Label>강사 이름</Label>
          <Input value={name} onChange={setName} placeholder="이름" />
          <Label>연락처 (선택)</Label>
          <Input value={formatPhone(phone)} onChange={(v) => setPhone(v.replace(/\D/g, "").slice(0, 11))} placeholder="010-0000-0000" />
        </ConsoleModal>
      ) : null}
    </>
  );
}

function Row({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[12px] font-medium text-[#9A917F]">{k}</span>
      <span className={`text-[15px] font-bold text-ink ${mono ? "tracking-[0.08em]" : ""}`}>{v}</span>
    </div>
  );
}

export function TrainerActions({
  id, name, phone, active, isOwner, isMe, memberCount, hasLogin,
}: {
  id: string; name: string; phone: string; active: boolean; isOwner: boolean; isMe: boolean; memberCount: number; hasLogin: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const [modal, setModal] = useState<null | "edit" | "delete" | "issue">(null);
  const [busy, setBusy] = useState(false);
  const [eName, setEName] = useState(name);
  const [ePhone, setEPhone] = useState(phone);
  const [tempPw, setTempPw] = useState<string | null>(null);
  const [issueUsername, setIssueUsername] = useState("");
  const [issued, setIssued] = useState<{ username: string; tempPassword: string } | null>(null);

  // 다른 대표 계정은 손대지 않음(잠금·권한 사고 방지). 본인 대표 계정은 정보 수정만 허용(삭제·비활성화는 아래에서 숨김).
  if (isOwner && !isMe) {
    return <div className="rounded-[13px] bg-[#FBF7F1] px-4 py-3.5 text-center text-[12.5px] font-medium text-[#9A917F]">다른 대표 계정은 콘솔에서 수정할 수 없어요</div>;
  }

  async function issueLogin() {
    if (busy) return;
    if (!issueUsername.trim()) return toast("아이디를 입력해주세요", "error");
    setBusy(true);
    const r = await issueInstructorLogin(id, issueUsername);
    setBusy(false);
    if (!r.ok || !r.username || !r.tempPassword) return toast(r.error ?? "계정 발급에 실패했어요", "error");
    setIssued({ username: r.username, tempPassword: r.tempPassword });
    router.refresh();
  }

  async function save() {
    setBusy(true);
    const r = await updateInstructor(id, eName, ePhone);
    setBusy(false);
    if (!r.ok) return toast(r.error ?? "수정에 실패했어요", "error");
    toast("정보를 수정했어요");
    setModal(null);
    router.refresh();
  }
  async function toggle() {
    setBusy(true);
    const r = await setInstructorActive(id, !active);
    setBusy(false);
    if (!r.ok) return toast(r.error ?? "상태 변경에 실패했어요", "error");
    toast(active ? "비활성화했어요" : "활성화했어요");
    router.refresh();
  }
  async function resetPassword() {
    if (busy) return;
    if (!(await confirm({ title: `${name} 강사의 비밀번호를 초기화할까요?`, description: "임시 비밀번호가 발급돼요.", confirmLabel: "초기화" }))) return;
    setBusy(true);
    const r = await resetInstructorPassword(id);
    setBusy(false);
    if (!r.ok) return toast(r.error ?? "초기화에 실패했어요", "error");
    setTempPw(r.tempPassword ?? null);
  }
  async function remove() {
    setBusy(true);
    const r = await deleteInstructor(id);
    setBusy(false);
    if (!r.ok) { setModal(null); return toast(r.error ?? "삭제에 실패했어요", "error"); }
    toast("강사를 삭제했어요");
    router.push("/console/trainers");
    router.refresh();
  }

  return (
    <>
      <div className="flex gap-2.5">
        <OBtn icon="pencil" className="flex-1" onClick={() => { setEName(name); setEPhone(phone); setModal("edit"); }}>정보 수정</OBtn>
        {/* 대표 본인 계정은 정보 수정만 — 비활성화·비번 초기화·삭제는 잠금 방지로 숨김 */}
        {!isOwner ? (
          <>
            {hasLogin ? (
              <>
                <OBtn icon={active ? "pause" : "play"} className="flex-1" disabled={busy || isMe} onClick={toggle}>{active ? "비활성화" : "활성화"}</OBtn>
                <OBtn icon="lock" className="flex-1" disabled={busy || isMe} onClick={resetPassword}>비번 초기화</OBtn>
              </>
            ) : (
              <OBtn icon="lock" className="flex-[2]" disabled={busy} onClick={() => { setIssued(null); setIssueUsername(""); setModal("issue"); }}>로그인 계정 발급</OBtn>
            )}
            <button onClick={() => setModal("delete")} disabled={busy || isMe} className="flex-none rounded-[12px] border-[1.4px] border-[rgba(198,115,82,0.4)] bg-white px-4 text-[13.5px] font-semibold text-terracotta transition hover:bg-[#FBF3E9] disabled:opacity-40">삭제</button>
          </>
        ) : null}
      </div>

      {!hasLogin ? (
        <div className="mt-2.5 rounded-[13px] bg-[#F8F4EC] px-4 py-3 text-[12px] font-medium leading-relaxed text-[#766D60]">
          명단에만 등록된 강사예요. 담당 배정은 지금도 되고, 앱 로그인은 아이디를 발급하면 열려요.
        </div>
      ) : null}

      {tempPw ? (
        <div className="mt-2.5 rounded-[14px] bg-[#FBF7F1] px-5 py-4">
          <Row k="임시 비밀번호" v={tempPw} mono />
          <div className="mt-2 text-[12px] leading-relaxed text-[#8A8175]">지금 강사에게 전달하세요. 첫 로그인 시 변경이 강제돼요.</div>
        </div>
      ) : null}

      {modal === "edit" ? (
        <ConsoleModal title="강사 정보 수정" onClose={() => setModal(null)} footer={<><OBtn className="flex-1" onClick={() => setModal(null)}>취소</OBtn><PBtn icon="check-bold" className="flex-[1.6]" pending={busy} onClick={save}>저장</PBtn></>}>
          <Label>이름</Label>
          <Input value={eName} onChange={setEName} />
          <Label>연락처</Label>
          <Input value={formatPhone(ePhone)} onChange={(v) => setEPhone(v.replace(/\D/g, "").slice(0, 11))} placeholder="010-0000-0000" />
        </ConsoleModal>
      ) : null}

      {modal === "issue" ? (
        <ConsoleModal
          title={issued ? "계정 발급 완료" : "로그인 계정 발급"}
          onClose={() => setModal(null)}
          footer={
            issued ? (
              <PBtn icon="check-bold" className="flex-1" onClick={() => setModal(null)}>확인</PBtn>
            ) : (
              <><OBtn className="flex-1" onClick={() => setModal(null)}>취소</OBtn><PBtn icon="lock-fill" className="flex-[1.6]" pending={busy} onClick={issueLogin}>발급하기</PBtn></>
            )
          }
        >
          {issued ? (
            <div>
              <p className="mb-4 text-[13px] leading-relaxed text-[#8A8175]">아래 아이디·임시 비밀번호를 <b className="text-ink">{name}</b> 강사에게 전달하세요. 첫 로그인 후 본인이 비밀번호를 바꿉니다.</p>
              <div className="rounded-[14px] bg-[#FBF7F1] px-5 py-4">
                <Row k="아이디" v={issued.username} />
                <div className="my-2.5 h-px bg-[rgba(75,59,46,0.07)]" />
                <Row k="임시 비밀번호" v={issued.tempPassword} mono />
              </div>
            </div>
          ) : (
            <>
              <p className="mb-3 text-[13px] leading-relaxed text-[#8A8175]"><b className="text-ink">{name}</b> 강사의 로그인 아이디를 정하면 임시 비밀번호가 발급돼요.</p>
              <Label>아이디 (영문 소문자·숫자, 3~20자)</Label>
              <Input value={issueUsername} onChange={setIssueUsername} placeholder="trainer01" />
            </>
          )}
        </ConsoleModal>
      ) : null}

      {modal === "delete" ? (
        <ConsoleModal title="강사 삭제" onClose={() => setModal(null)} footer={<><OBtn className="flex-1" onClick={() => setModal(null)}>취소</OBtn><button onClick={remove} disabled={busy} className="flex-[1.6] rounded-[12px] bg-terracotta py-[11px] text-[14px] font-semibold text-white transition hover:brightness-105 disabled:opacity-50">삭제</button></>}>
          <p className="text-[13.5px] leading-relaxed text-[#766D60]">
            <b className="text-ink">{name}</b> 강사를 삭제할까요? 계정까지 완전히 삭제돼요.
            {memberCount > 0 ? <span className="mt-2 block rounded-[11px] bg-[#FBF3E9] px-3.5 py-2.5 text-[12.5px] font-medium text-[#B5612F]">담당 회원이 {memberCount}명 있어 삭제할 수 없어요. 먼저 비활성화하거나 회원을 재배정하세요.</span> : null}
          </p>
        </ConsoleModal>
      ) : null}
    </>
  );
}

/** 강사 회당 단가(1:1 / 2:1) 편집 — 정산 지급액 계산 기준. 변경은 다음 진행분부터 적용(지난 정산 불변). */
export function TrainerRates({ id, rate1on1, rate2on1 }: { id: string; rate1on1: number; rate2on1: number }) {
  const router = useRouter();
  const toast = useToast();
  const [r1, setR1] = useState(String(rate1on1 || ""));
  const [r2, setR2] = useState(String(rate2on1 || ""));
  const [busy, setBusy] = useState(false);
  const dirty = Number(r1 || 0) !== rate1on1 || Number(r2 || 0) !== rate2on1;

  async function save() {
    if (busy || !dirty) return;
    setBusy(true);
    const res = await setTrainerRates(id, Number(r1 || 0), Number(r2 || 0));
    setBusy(false);
    if (!res.ok) return toast(res.error ?? "단가 저장에 실패했어요", "error");
    toast("회당 단가를 저장했어요");
    router.refresh();
  }

  return (
    <div className="mt-[18px] rounded-[15px] border border-[rgba(75,59,46,0.08)] bg-[#FBF7F1] px-5 py-[18px]">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <div className="text-[13.5px] font-bold text-ink">회당 단가</div>
          <div className="mt-0.5 text-[11.5px] font-medium text-[#9A917F]">정산 지급액 계산 기준 · 변경은 다음 진행분부터 적용</div>
        </div>
        <PBtn icon="check-bold" className="!px-4" pending={busy} disabled={!dirty} onClick={save}>저장</PBtn>
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        <RateField label="1:1 회당" value={r1} onChange={setR1} />
        <RateField label="2:1 회당" value={r2} onChange={setR2} />
      </div>
    </div>
  );
}

function RateField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const n = Number(value || 0);
  return (
    <div>
      <div className="mb-[6px] text-[11.5px] font-semibold text-[#766D60]">{label}</div>
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[13px] font-semibold text-[#9A917F]">₩</span>
        <input
          inputMode="numeric"
          maxLength={8}
          value={value}
          onChange={(e) => onChange(e.target.value.replace(/[^\d]/g, "").slice(0, 8))}
          placeholder="0"
          className="w-full rounded-[11px] border border-[rgba(75,59,46,0.14)] bg-white py-[10px] pl-7 pr-3 text-[14px] font-semibold text-ink outline-none focus-visible:ring-2 focus-visible:ring-sage/40 placeholder:text-[#B3AA9C]"
        />
      </div>
      {n > 0 ? <div className="mt-1 pl-1 text-[11px] font-medium text-sage-deep">{won(n)}</div> : null}
    </div>
  );
}
