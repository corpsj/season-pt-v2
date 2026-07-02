"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/Toast";
import { PBtn, OBtn, ConsoleModal } from "@/components/console/ui";
import { inviteInstructor, updateInstructor, setInstructorActive, deleteInstructor, resetInstructorPassword } from "@/lib/auth/trainer-actions";

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

export function InviteTrainerButton() {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [username, setUsername] = useState("");
  const [result, setResult] = useState<{ username: string; tempPassword: string } | null>(null);

  function reset() {
    setName(""); setPhone(""); setUsername(""); setResult(null);
  }
  async function submit() {
    if (busy) return;
    if (!name.trim() || !username.trim()) return toast("이름과 아이디를 입력해주세요");
    setBusy(true);
    const r = await inviteInstructor(name, phone, username);
    setBusy(false);
    if (!r.ok || !r.username || !r.tempPassword) return toast(r.error ?? "초대에 실패했어요");
    setResult({ username: r.username, tempPassword: r.tempPassword });
    router.refresh();
  }

  return (
    <>
      <PBtn icon="person-plus" className="flex-none !px-5" onClick={() => { reset(); setOpen(true); }}>강사 초대</PBtn>
      {open ? (
        <ConsoleModal
          title={result ? "초대 완료" : "강사 초대"}
          onClose={() => setOpen(false)}
          footer={
            result ? (
              <PBtn icon="check-bold" className="flex-1" onClick={() => setOpen(false)}>확인</PBtn>
            ) : (
              <><OBtn className="flex-1" onClick={() => setOpen(false)}>취소</OBtn><PBtn icon="person-plus" className="flex-[1.6]" disabled={busy} onClick={submit}>초대하기</PBtn></>
            )
          }
        >
          {result ? (
            <div>
              <p className="mb-4 text-[13px] leading-relaxed text-[#8A8175]">아래 아이디·임시 비밀번호를 강사에게 전달하세요. 첫 로그인 후 본인이 비밀번호를 바꿉니다.</p>
              <div className="rounded-[14px] bg-[#FBF7F1] px-5 py-4">
                <Row k="아이디" v={result.username} />
                <div className="my-2.5 h-px bg-[rgba(75,59,46,0.07)]" />
                <Row k="임시 비밀번호" v={result.tempPassword} mono />
              </div>
            </div>
          ) : (
            <>
              <p className="mb-3 text-[13px] leading-relaxed text-[#8A8175]">강사 정보를 입력하면 아이디와 임시 비밀번호가 발급돼요.</p>
              <Label>강사 이름</Label>
              <Input value={name} onChange={setName} placeholder="이름" />
              <Label>연락처</Label>
              <Input value={phone} onChange={setPhone} placeholder="010-0000-0000" />
              <Label>아이디 (영문 소문자·숫자, 3~20자)</Label>
              <Input value={username} onChange={setUsername} placeholder="trainer01" />
            </>
          )}
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
  id, name, phone, active, isOwner, isMe, memberCount,
}: {
  id: string; name: string; phone: string; active: boolean; isOwner: boolean; isMe: boolean; memberCount: number;
}) {
  const router = useRouter();
  const toast = useToast();
  const [modal, setModal] = useState<null | "edit" | "delete">(null);
  const [busy, setBusy] = useState(false);
  const [eName, setEName] = useState(name);
  const [ePhone, setEPhone] = useState(phone);
  const [tempPw, setTempPw] = useState<string | null>(null);

  if (isOwner) {
    return <div className="rounded-[13px] bg-[#FBF7F1] px-4 py-3.5 text-center text-[12.5px] font-medium text-[#9A917F]">대표 계정은 콘솔에서 수정·삭제할 수 없어요</div>;
  }

  async function save() {
    setBusy(true);
    const r = await updateInstructor(id, eName, ePhone);
    setBusy(false);
    if (!r.ok) return toast(r.error ?? "수정에 실패했어요");
    toast("정보를 수정했어요");
    setModal(null);
    router.refresh();
  }
  async function toggle() {
    setBusy(true);
    const r = await setInstructorActive(id, !active);
    setBusy(false);
    if (!r.ok) return toast(r.error ?? "상태 변경에 실패했어요");
    toast(active ? "비활성화했어요" : "활성화했어요");
    router.refresh();
  }
  async function resetPassword() {
    if (busy) return;
    if (!confirm(`${name} 강사의 비밀번호를 초기화할까요? 임시 비밀번호가 발급돼요.`)) return;
    setBusy(true);
    const r = await resetInstructorPassword(id);
    setBusy(false);
    if (!r.ok) return toast(r.error ?? "초기화에 실패했어요");
    setTempPw(r.tempPassword ?? null);
  }
  async function remove() {
    setBusy(true);
    const r = await deleteInstructor(id);
    setBusy(false);
    if (!r.ok) { setModal(null); return toast(r.error ?? "삭제에 실패했어요"); }
    toast("강사를 삭제했어요");
    router.push("/console/trainers");
    router.refresh();
  }

  return (
    <>
      <div className="flex gap-2.5">
        <OBtn icon="pencil" className="flex-1" onClick={() => { setEName(name); setEPhone(phone); setModal("edit"); }}>정보 수정</OBtn>
        <OBtn icon={active ? "pause" : "play"} className="flex-1" disabled={busy || isMe} onClick={toggle}>{active ? "비활성화" : "활성화"}</OBtn>
        <OBtn icon="lock" className="flex-1" disabled={busy || isMe} onClick={resetPassword}>비번 초기화</OBtn>
        <button onClick={() => setModal("delete")} disabled={busy || isMe} className="flex-none rounded-[12px] border-[1.4px] border-[rgba(198,115,82,0.4)] bg-white px-4 text-[13.5px] font-semibold text-terracotta transition hover:bg-[#FBF3E9] disabled:opacity-40">삭제</button>
      </div>

      {tempPw ? (
        <div className="mt-2.5 rounded-[14px] bg-[#FBF7F1] px-5 py-4">
          <Row k="임시 비밀번호" v={tempPw} mono />
          <div className="mt-2 text-[12px] leading-relaxed text-[#8A8175]">지금 강사에게 전달하세요. 첫 로그인 시 변경이 강제돼요.</div>
        </div>
      ) : null}

      {modal === "edit" ? (
        <ConsoleModal title="강사 정보 수정" onClose={() => setModal(null)} footer={<><OBtn className="flex-1" onClick={() => setModal(null)}>취소</OBtn><PBtn icon="check-bold" className="flex-[1.6]" disabled={busy} onClick={save}>저장</PBtn></>}>
          <Label>이름</Label>
          <Input value={eName} onChange={setEName} />
          <Label>연락처</Label>
          <Input value={ePhone} onChange={setEPhone} placeholder="010-0000-0000" />
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
