import { ownerExists } from "@/lib/auth/context";
import { TrainerLoginForm } from "./ui";

// 대표 존재 여부는 매 요청 평가해야 한다(정적 프리렌더 시 부트스트랩 상태가 빌드 시점에 고정됨).
export const dynamic = "force-dynamic";

// 대표 계정이 아직 없을 때만(부트스트랩) 대표 회원가입 진입점을 노출한다.
export default async function TrainerLoginPage() {
  const showOwnerSignup = !(await ownerExists());
  return <TrainerLoginForm showOwnerSignup={showOwnerSignup} />;
}
