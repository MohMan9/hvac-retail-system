import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { btnPrimary } from "@/lib/ui";

export function EmptyState({
  icon: Icon,
  message,
  actionLabel,
  actionHref,
}: {
  icon: LucideIcon;
  message: string;
  actionLabel?: string;
  actionHref?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center">
      <Icon className="h-10 w-10 text-slate-300" strokeWidth={1.5} />
      <p className="text-sm text-slate-500">{message}</p>
      {actionLabel && actionHref && (
        <Link href={actionHref} className={btnPrimary}>
          {actionLabel}
        </Link>
      )}
    </div>
  );
}
