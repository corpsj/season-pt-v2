"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Body } from "@/components/shell/Body";
import { BackButton } from "@/components/shell/BackButton";
import { Card } from "@/components/ui/Card";
import { Kicker } from "@/components/ui/Kicker";
import { Field, TextInput } from "@/components/ui/Field";
import { Switch } from "@/components/ui/Switch";
import { PrimaryButton } from "@/components/ui/Button";
import { Banner } from "@/components/ui/Banner";
import { Icon } from "@/components/ui/icon";
import { useToast } from "@/components/ui/Toast";
import {
  createProduct,
  updateProduct,
  setProductActive,
} from "@/lib/data/groups/owner-ops-actions";
import type { MembershipProduct } from "@/lib/types";

type FormState = {
  name: string;
  sessions: string;
  price: string;
  unitListPrice: string;
  durationDays: string;
};

const EMPTY_FORM: FormState = { name: "", sessions: "", price: "", unitListPrice: "", durationDays: "90" };

function productToForm(p: MembershipProduct): FormState {
  return {
    name: p.name,
    sessions: String(p.sessions),
    price: String(p.price),
    unitListPrice: p.unitListPrice ? String(p.unitListPrice) : "",
    durationDays: String(p.durationDays),
  };
}

export function ProductsClient({ products }: { products: MembershipProduct[] }) {
  const router = useRouter();
  const toast = useToast();
  const [editId, setEditId] = useState<string | "new" | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [busy, setBusy] = useState(false);

  function openNew() {
    setForm(EMPTY_FORM);
    setEditId("new");
  }

  function openEdit(p: MembershipProduct) {
    setForm(productToForm(p));
    setEditId(p.id);
  }

  function closeForm() {
    setEditId(null);
    setForm(EMPTY_FORM);
  }

  async function onSave() {
    if (busy) return;
    const sessions = Number(form.sessions);
    const price = Number(form.price.replace(/[^\d]/g, ""));
    const unitListPrice = Number(form.unitListPrice.replace(/[^\d]/g, "") || "0");
    const durationDays = Number(form.durationDays);
    if (!form.name.trim()) return toast("상품명을 입력해주세요");
    if (!sessions || sessions <= 0) return toast("회차를 입력해주세요");
    if (!price || price <= 0) return toast("가격을 입력해주세요");
    if (!durationDays || durationDays <= 0) return toast("유효기간을 입력해주세요");

    setBusy(true);
    const input = { name: form.name.trim(), sessions, price, unitListPrice, durationDays };
    const res =
      editId === "new"
        ? await createProduct(input)
        : await updateProduct(editId!, input);
    setBusy(false);
    if (!res.ok) {
      toast(res.error ?? "저장에 실패했어요");
      return;
    }
    toast(editId === "new" ? "상품을 추가했어요" : "상품을 수정했어요");
    closeForm();
    router.refresh();
  }

  async function onToggleActive(p: MembershipProduct) {
    const res = await setProductActive(p.id, !p.active);
    if (!res.ok) toast(res.error ?? "상태 변경에 실패했어요");
    else router.refresh();
  }

  const f = (field: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((prev) => ({ ...prev, [field]: e.target.value }));

  return (
    <div className="scr flex min-h-0 flex-1 flex-col">
      <Body>
        {/* header */}
        <div className="mb-5 flex items-center gap-3">
          <BackButton fallback="/t/settings" />
          <span className="text-[19px] font-bold text-ink">회원권 상품</span>
        </div>

        {/* add/edit form */}
        {editId ? (
          <Card className="mb-6 flex flex-col gap-3 p-4">
            <div className="text-[13px] font-bold text-sage-deep">
              {editId === "new" ? "상품 추가" : "상품 수정"}
            </div>
            <Field icon="ticket-fill" label="상품명">
              <TextInput placeholder="1:1 PT 10회권" value={form.name} onChange={f("name")} />
            </Field>
            <Field icon="refresh" label="회차">
              <TextInput inputMode="numeric" placeholder="10" value={form.sessions} onChange={f("sessions")} />
            </Field>
            <Field icon="coins" label="가격 (원)">
              <TextInput inputMode="numeric" placeholder="750000" value={form.price} onChange={f("price")} />
            </Field>
            <Field icon="coins" label="1회 정상가 (환불 기준, 원)">
              <TextInput inputMode="numeric" placeholder="100000" value={form.unitListPrice} onChange={f("unitListPrice")} />
            </Field>
            <Field icon="calendar" label="유효기간 (일)">
              <TextInput inputMode="numeric" placeholder="90" value={form.durationDays} onChange={f("durationDays")} />
            </Field>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={closeForm}
                className="tappable flex-1 rounded-[13px] border border-ink/[0.12] bg-card py-3 text-[14px] font-bold text-muted5"
              >
                취소
              </button>
              <button
                type="button"
                onClick={onSave}
                disabled={busy}
                className="tappable flex-1 rounded-[13px] bg-sage py-3 text-[14px] font-bold text-surface disabled:opacity-60"
              >
                저장
              </button>
            </div>
          </Card>
        ) : (
          <div className="mb-4">
            <PrimaryButton icon="plus-bold" onClick={openNew}>
              상품 추가
            </PrimaryButton>
          </div>
        )}

        {/* product list */}
        <div className="mb-2.5">
          <Kicker>상품 목록</Kicker>
        </div>

        {products.length === 0 ? (
          <Card className="p-6 text-center text-[13.5px] text-muted">
            등록된 상품이 없어요. '상품 추가'로 시작하세요.
          </Card>
        ) : (
          <Card className="overflow-hidden">
            {products.map((p, i) => (
              <div
                key={p.id}
                className={`flex items-center gap-3 px-4 py-[14px] ${i > 0 ? "border-t border-ink/[0.07]" : ""} ${!p.active ? "opacity-50" : ""}`}
              >
                <div className="min-w-0 flex-1">
                  <div className="text-[14px] font-bold text-ink">{p.name}</div>
                  <div className="mt-0.5 text-[12px] text-muted">
                    {p.sessions}회 · ₩{p.price.toLocaleString()} · {p.durationDays}일
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => openEdit(p)}
                  className="tappable flex h-8 w-8 items-center justify-center rounded-full text-muted hover:bg-sage-banner"
                  aria-label="수정"
                >
                  <Icon name="pencil" size={16} />
                </button>
                <Switch
                  on={p.active}
                  onChange={() => onToggleActive(p)}
                  label={p.active ? "활성" : "비활성"}
                />
              </div>
            ))}
          </Card>
        )}

        <div className="mt-4">
          <Banner tone="neutral">비활성 상품은 발급 화면에 표시되지 않아요.</Banner>
        </div>
        <div className="h-3.5" />
      </Body>
    </div>
  );
}
