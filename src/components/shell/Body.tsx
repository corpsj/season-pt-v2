import { cn } from "@/lib/cn";

type Pad = "list" | "form" | "wide" | "none";
const PAD: Record<Pad, string> = {
  list: "px-[18px] pt-2", // tab/list screens
  form: "px-[22px] pt-2", // login/forms
  wide: "px-6 pt-2", // onboarding
  none: "",
};
const FOOTER_PAD: Record<Pad, string> = {
  list: "px-[18px]",
  form: "px-[22px]",
  wide: "px-6",
  none: "",
};

/** Scrollable screen body (scrollbar hidden). */
export function Body({
  children,
  className,
  pad = "list",
}: {
  children: React.ReactNode;
  className?: string;
  pad?: Pad;
}) {
  return (
    <div className={cn("no-scrollbar flex min-h-0 flex-1 flex-col overflow-y-auto", PAD[pad], className)}>
      {children}
    </div>
  );
}

/** Fixed footer area with bottom safe-area inset. */
export function Footer({
  children,
  className,
  pad = "list",
}: {
  children: React.ReactNode;
  className?: string;
  pad?: Pad;
}) {
  return (
    <div className={cn("flex-none pt-3 pb-[max(30px,env(safe-area-inset-bottom))]", FOOTER_PAD[pad], className)}>
      {children}
    </div>
  );
}
