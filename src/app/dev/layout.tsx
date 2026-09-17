import { notFound } from "next/navigation";

/** 디자인 카탈로그는 로컬 개발 전용이며 운영 배포에서는 노출하지 않는다. */
export default function DevLayout({ children }: { children: React.ReactNode }) {
  if (process.env.NODE_ENV === "production") notFound();
  return children;
}
