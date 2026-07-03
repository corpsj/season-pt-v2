"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Body } from "@/components/shell/Body";
import { BackButton } from "@/components/shell/BackButton";
import { Card } from "@/components/ui/Card";
import { Field, TextInput } from "@/components/ui/Field";
import { SegmentedToggle } from "@/components/ui/SegmentedToggle";
import { PrimaryButton } from "@/components/ui/Button";
import { Icon } from "@/components/ui/icon";
import { EmptyState } from "@/components/ui/EmptyState";
import { useToast } from "@/components/ui/Toast";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { createNotice, deleteNotice } from "@/lib/data/groups/owner-ops-actions";
import type { OwnerNotice } from "@/lib/data/groups/owner-ops";

type Cat = "important" | "ops" | "facility";

export function NoticesClient({ notices }: { notices: OwnerNotice[] }) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const [pending, startTransition] = useTransition();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [cat, setCat] = useState<Cat>("ops");

  function add() {
    if (!title.trim()) {
      toast("제목을 입력해주세요", "error");
      return;
    }
    startTransition(async () => {
      const r = await createNotice({ title, body, category: cat });
      if (r.ok) {
        setTitle("");
        setBody("");
        toast("공지를 게시했어요");
        router.refresh();
      } else toast(r.error ?? "작성에 실패했어요", "error");
    });
  }

  async function remove(id: string) {
    if (!(await confirm({ title: "이 공지를 삭제할까요?", description: "회원에게 더 이상 보이지 않아요.", confirmLabel: "삭제", tone: "warn" }))) return;
    startTransition(async () => {
      const r = await deleteNotice(id);
      toast(r.ok ? "삭제했어요" : (r.error ?? "삭제에 실패했어요"), r.ok ? "success" : "error");
      if (r.ok) router.refresh();
    });
  }

  return (
    <div className="scr flex min-h-0 flex-1 flex-col">
      <Body>
        <div className="mb-5 flex items-center gap-3">
          <BackButton fallback="/t/perf" />
          <span className="text-[19px] font-bold text-ink">공지사항 관리</span>
        </div>

        <Card className="mb-4 p-4">
          <div className="flex flex-col gap-3">
            <SegmentedToggle
              value={cat}
              onChange={setCat}
              options={[
                { value: "ops", label: "운영" },
                { value: "important", label: "중요" },
                { value: "facility", label: "시설" },
              ]}
            />
            <Field icon="megaphone" label="제목">
              <TextInput value={title} onChange={(e) => setTitle(e.target.value)} placeholder="예: 추석 휴관 안내" />
            </Field>
            <Field label="내용">
              <TextInput value={body} onChange={(e) => setBody(e.target.value)} placeholder="자세한 안내 (선택)" />
            </Field>
            <PrimaryButton icon="plus" onClick={add} pending={pending}>
              회원 앱에 게시
            </PrimaryButton>
          </div>
        </Card>

        {notices.length === 0 ? (
          <EmptyState icon="megaphone" title="게시된 공지가 없어요" desc="회원 앱 공지사항에 보여줄 글을 작성해보세요." />
        ) : (
          <div className="flex flex-col gap-2.5">
            {notices.map((n) => (
              <Card key={n.id} className="flex items-start gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-bold text-sage-deep">{n.tag}</span>
                    <span className="text-[11px] text-muted2">{n.dateLabel}</span>
                  </div>
                  <div className="mt-1 text-[14px] font-bold text-ink">{n.title}</div>
                  {n.body ? <div className="mt-0.5 text-[12.5px] leading-[1.5] text-muted">{n.body}</div> : null}
                </div>
                <button
                  type="button"
                  onClick={() => remove(n.id)}
                  disabled={pending}
                  aria-label="삭제"
                  className="tappable flex-none rounded-full p-1 text-muted2 hover:text-terracotta"
                >
                  <Icon name="close" size={18} />
                </button>
              </Card>
            ))}
          </div>
        )}
        <div className="h-3.5" />
      </Body>
    </div>
  );
}
