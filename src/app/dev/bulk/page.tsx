"use client";
// TEMP: 한꺼번에 입력 모달 시각 검증용 샌드박스 — 검증 후 삭제
import { BulkAddModal } from "@/app/console/members/bulk";
import type { MembershipProduct } from "@/lib/types";

const PRODUCTS: MembershipProduct[] = [
  { id: "p10", name: "1:1 PT 10회권", sessions: 10, price: 700000, unitListPrice: 70000, durationDays: 90, active: true, sortOrder: 1 },
  { id: "p20", name: "1:1 PT 20회권", sessions: 20, price: 1300000, unitListPrice: 65000, durationDays: 150, active: true, sortOrder: 2 },
  { id: "p30", name: "1:1 PT 30회권", sessions: 30, price: 1800000, unitListPrice: 60000, durationDays: 210, active: true, sortOrder: 3 },
];
const TRAINERS = [
  { id: "t1", name: "정호진" },
  { id: "t2", name: "한지민" },
];

export default function DevBulkPage() {
  return (
    <div className="min-h-dvh bg-canvas">
      <BulkAddModal products={PRODUCTS} trainers={TRAINERS} onClose={() => {}} onDone={() => {}} />
    </div>
  );
}
