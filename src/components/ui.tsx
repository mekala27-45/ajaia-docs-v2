import type { ButtonHTMLAttributes } from "react";
import { initials } from "@/lib/format";
import { ACCESS_LABEL, type Access } from "@/lib/limits";

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

const BUTTON_BASE =
  "inline-flex items-center justify-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 " +
  "disabled:cursor-not-allowed disabled:opacity-50";

const BUTTON_VARIANTS = {
  primary: "bg-blue-600 text-white shadow-sm hover:bg-blue-700",
  secondary: "border border-slate-300 bg-white text-slate-700 shadow-sm hover:bg-slate-50",
  ghost: "text-slate-600 hover:bg-slate-100",
  danger: "bg-red-600 text-white shadow-sm hover:bg-red-700",
} as const;

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: keyof typeof BUTTON_VARIANTS;
};

export function Button({ variant = "secondary", className, type = "button", ...props }: ButtonProps) {
  return <button type={type} {...props} className={cx(BUTTON_BASE, BUTTON_VARIANTS[variant], className)} />;
}

export function Avatar({ name, color, size = "md" }: { name: string; color: string; size?: "sm" | "md" }) {
  return (
    <span
      aria-hidden="true"
      className={cx(
        "inline-grid shrink-0 place-items-center rounded-full font-semibold text-white",
        size === "sm" ? "h-6 w-6 text-[10px]" : "h-8 w-8 text-xs",
      )}
      style={{ backgroundColor: color }}
    >
      {initials(name)}
    </span>
  );
}

const ACCESS_STYLES: Record<Access, string> = {
  owner: "bg-blue-50 text-blue-700 ring-blue-200",
  editor: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  viewer: "bg-slate-100 text-slate-600 ring-slate-200",
};

export function AccessBadge({ access }: { access: Access }) {
  return (
    <span
      className={cx(
        "inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset",
        ACCESS_STYLES[access],
      )}
    >
      {ACCESS_LABEL[access]}
    </span>
  );
}

export function Alert({ children, tone = "error" }: { children: React.ReactNode; tone?: "error" | "info" | "warning" }) {
  const tones = {
    error: "border-red-200 bg-red-50 text-red-800",
    info: "border-blue-200 bg-blue-50 text-blue-800",
    warning: "border-amber-200 bg-amber-50 text-amber-900",
  } as const;
  return (
    <div role={tone === "error" ? "alert" : "status"} className={cx("rounded-lg border px-3 py-2 text-sm", tones[tone])}>
      {children}
    </div>
  );
}
