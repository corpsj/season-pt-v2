"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Body } from "@/components/shell/Body";
import { BackButton } from "@/components/shell/BackButton";
import { Card } from "@/components/ui/Card";
import { Kicker } from "@/components/ui/Kicker";
import { Switch } from "@/components/ui/Switch";
import { Icon } from "@/components/ui/icon";
import { useToast } from "@/components/ui/Toast";
import {
  createExercise,
  renameExercise,
  setExerciseActive,
} from "@/lib/data/groups/owner-ops-actions";
import type { ExerciseItem } from "@/lib/types";

export function ExercisesClient({ exercises: init }: { exercises: ExerciseItem[] }) {
  const router = useRouter();
  const toast = useToast();
  const [items, setItems] = useState(init);
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleAdd() {
    const name = newName.trim();
    if (!name || busy) return;
    setBusy(true);
    const res = await createExercise(name);
    setBusy(false);
    if (!res.ok) return toast(res.error ?? "추가에 실패했어요");
    setNewName("");
    toast("종목이 추가되었어요");
    router.refresh();
  }

  async function handleRename(id: string) {
    const name = editName.trim();
    if (!name || busy) return;
    setBusy(true);
    const res = await renameExercise(id, name);
    setBusy(false);
    if (!res.ok) return toast(res.error ?? "이름 변경에 실패했어요");
    setItems((prev) => prev.map((e) => (e.id === id ? { ...e, name } : e)));
    setEditingId(null);
    toast("이름이 변경되었어요");
  }

  async function handleToggle(id: string, active: boolean) {
    setItems((prev) => prev.map((e) => (e.id === id ? { ...e, active } : e)));
    const res = await setExerciseActive(id, active);
    if (!res.ok) {
      // rollback
      setItems((prev) => prev.map((e) => (e.id === id ? { ...e, active: !active } : e)));
      toast(res.error ?? "상태 변경에 실패했어요");
    }
  }

  const startEdit = (item: ExerciseItem) => {
    setEditingId(item.id);
    setEditName(item.name);
  };

  return (
    <div className="scr flex min-h-0 flex-1 flex-col">
      <Body>
        <div className="mb-5 flex items-center gap-3">
          <BackButton fallback="/t/settings" />
          <span className="text-[19px] font-bold text-ink">운동 종목</span>
        </div>

        {/* add new */}
        <div className="mb-2.5">
          <Kicker>종목 추가</Kicker>
        </div>
        <Card className="mb-5 flex items-center gap-2 px-3.5 py-3">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            placeholder="새 종목 이름"
            className="flex-1 bg-transparent text-[14px] text-ink outline-none placeholder:text-placeholder"
          />
          <button
            type="button"
            onClick={handleAdd}
            disabled={!newName.trim() || busy}
            className="tappable flex h-8 w-8 flex-none items-center justify-center rounded-full bg-sage text-white disabled:opacity-40"
            aria-label="추가"
          >
            <Icon name="plus-bold" size={16} />
          </button>
        </Card>

        {/* list */}
        <div className="mb-2.5">
          <Kicker>종목 목록</Kicker>
        </div>
        <Card className="overflow-hidden">
          {items.length === 0 && (
            <div className="px-4 py-5 text-center text-[13px] text-muted">
              등록된 종목이 없어요
            </div>
          )}
          {items.map((item, i) => (
            <div
              key={item.id}
              className={`flex items-center gap-3 px-4 py-[13px] ${i > 0 ? "border-t border-ink/[0.07]" : ""}`}
            >
              {editingId === item.id ? (
                <>
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleRename(item.id);
                      if (e.key === "Escape") setEditingId(null);
                    }}
                    autoFocus
                    className="flex-1 bg-transparent text-[14px] font-medium text-ink outline-none rounded focus:ring-2 focus:ring-sage/40"
                  />
                  <button
                    type="button"
                    onClick={() => handleRename(item.id)}
                    disabled={busy}
                    className="tappable text-[13px] font-bold text-sage disabled:opacity-40"
                  >
                    저장
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingId(null)}
                    className="tappable text-[13px] font-medium text-muted"
                  >
                    취소
                  </button>
                </>
              ) : (
                <>
                  <span
                    className={`flex-1 text-[14px] font-medium ${item.active ? "text-ink" : "text-muted line-through"}`}
                  >
                    {item.name}
                  </span>
                  <button
                    type="button"
                    onClick={() => startEdit(item)}
                    className="tappable mr-1 text-[13px] font-medium text-sage"
                  >
                    수정
                  </button>
                  <Switch
                    on={item.active}
                    onChange={(v) => handleToggle(item.id, v)}
                    label={item.active ? "활성" : "비활성"}
                  />
                </>
              )}
            </div>
          ))}
        </Card>
        <div className="h-3.5" />
      </Body>
    </div>
  );
}
