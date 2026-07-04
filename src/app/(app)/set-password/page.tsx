import { redirect } from "next/navigation";
import { getTrainerContext } from "@/lib/auth/context";
import { SetPasswordClient } from "./ui";

export default async function SetPasswordPage() {
  const ctx = await getTrainerContext();
  if (!ctx) redirect("/login/trainer");
  return <SetPasswordClient needsUsername={ctx.needsUsername} />;
}
