import { redirect } from "next/navigation";
import { getTrainerSetupContext } from "@/lib/auth/context";

export default async function TrainerLayout({ children }: { children: React.ReactNode }) {
  const trainer = await getTrainerSetupContext();

  if (!trainer) redirect("/login/trainer");
  if (trainer.mustChangePassword) redirect("/set-password");

  return children;
}
