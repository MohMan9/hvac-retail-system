"use client";

import { usePathname } from "next/navigation";
import { LogOut, Menu } from "lucide-react";
import { LanguageSwitcher } from "@/lib/i18n/LanguageSwitcher";
import { RoleBadge } from "@/components/ui/badge";
import { getPageTitleKey } from "@/lib/nav-title";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import { signOut } from "@/app/signin/actions";
import { NotificationsBell } from "./notifications-bell";
import { useMobileSidebar } from "./mobile-sidebar-context";
import { btnSecondarySm } from "@/lib/ui";

export function Topbar({
  dict,
  role,
  fullName,
  initialUnreadCount,
}: {
  dict: Dictionary;
  role: string;
  fullName: string | null;
  initialUnreadCount: number;
}) {
  const pathname = usePathname();
  const titleKey = getPageTitleKey(pathname);
  const { toggle } = useMobileSidebar();

  return (
    <header className="flex h-16 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4 lg:px-8">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={toggle}
          aria-label="Open menu"
          className="-ms-1 rounded-md p-1.5 text-slate-500 hover:bg-slate-100 lg:hidden"
        >
          <Menu className="h-5 w-5" />
        </button>
        <h1 className="text-lg font-semibold text-slate-900">{dict[titleKey]}</h1>
      </div>

      <div className="flex items-center gap-4">
        <LanguageSwitcher />

        <NotificationsBell initialUnreadCount={initialUnreadCount} />

        <div className="flex items-center gap-2 border-s border-slate-200 ps-4">
          <span className="text-sm font-medium text-slate-900">{fullName ?? "—"}</span>
          <RoleBadge role={role} dict={dict} />
        </div>

        <form action={signOut}>
          <button type="submit" className={`${btnSecondarySm} gap-1.5`}>
            <LogOut className="h-3.5 w-3.5" />
            {dict["nav.signOut"]}
          </button>
        </form>
      </div>
    </header>
  );
}
