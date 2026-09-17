import { redirect } from "next/navigation";
import { getTrainerSetupContext } from "@/lib/auth/context";
import { SetPasswordClient } from "./ui";

export default async function SetPasswordPage() {
  const ctx = await getTrainerSetupContext();
  if (!ctx) redirect("/login/trainer");
  return <SetPasswordClient needsUsername={ctx.needsUsername} />;
}
