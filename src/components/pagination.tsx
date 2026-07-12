import type { ReactNode } from "react";
import Link from "next/link";
import { buildPageHref } from "@/lib/pagination";
import type { Dictionary } from "@/lib/i18n/dictionaries";

function NavButton({
  href,
  disabled,
  children,
}: {
  href: string;
  disabled: boolean;
  children: ReactNode;
}) {
  if (disabled) {
    return (
      <span className="rounded-lg border border-slate-200 px-3 py-1.5 text-slate-300">
        {children}
      </span>
    );
  }

  return (
    <Link
      href={href}
      className="rounded-lg border border-slate-300 px-3 py-1.5 text-slate-700 hover:bg-slate-50"
    >
      {children}
    </Link>
  );
}

export function Pagination({
  basePath,
  params,
  page,
  totalPages,
  dict,
}: {
  basePath: string;
  params: Record<string, string | undefined>;
  page: number;
  totalPages: number;
  dict: Dictionary;
}) {
  return (
    <div className="mt-4 flex items-center justify-between text-sm text-slate-500">
      <span>
        {dict["pagination.page"]} {page} {dict["pagination.of"]} {totalPages}
      </span>
      <div className="flex gap-2">
        <NavButton
          href={buildPageHref(basePath, params, Math.max(1, page - 1))}
          disabled={page <= 1}
        >
          {dict["pagination.previous"]}
        </NavButton>
        <NavButton
          href={buildPageHref(basePath, params, page + 1)}
          disabled={page >= totalPages}
        >
          {dict["pagination.next"]}
        </NavButton>
      </div>
    </div>
  );
}
