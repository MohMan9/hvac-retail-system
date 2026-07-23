import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth.server";
import { createClient } from "@/lib/supabase/server";
import { getServerDictionary } from "@/lib/i18n/get-server-locale";
import { getEffectivePermissions } from "@/lib/permissions.server";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";
import { MobileSidebarProvider } from "./mobile-sidebar-context";

export default async function DashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  const supabase = await createClient();
  const authData = await getCurrentUser();

  if (!authData.user) {
    redirect("/signin");
  }

  const profilePromise = supabase
    .from("profiles")
    .select("role, full_name, is_active")
    .eq("id", authData.user.id)
    .single();

  // These requests are independent once the authenticated user ID is known.
  const permissionsPromise = getEffectivePermissions();
  const unreadCountPromise = supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("recipient_id", authData.user.id)
    .eq("is_read", false);
  const dictionaryPromise = getServerDictionary();

  const [
    { data: profile },
    permissions,
    { count: unreadCount },
    { dict },
  ] = await Promise.all([
    profilePromise,
    permissionsPromise,
    unreadCountPromise,
    dictionaryPromise,
  ]);

  if (!profile) {
    redirect("/signin");
  }

  // A user deactivated mid-session must not keep working off an existing
  // cookie — RLS blocks their data, but the shell would still render. Sign
  // them out and bounce to /signin with a clear reason.
  if (profile.is_active === false) {
    await supabase.auth.signOut();
    redirect("/signin?deactivated=1");
  }

  // One query for the whole nav — the sidebar decides item visibility from
  // this permission map (RLS independently enforces the same rules).
  return (
    <MobileSidebarProvider>
      <div className="flex min-h-screen bg-slate-50">
        <Sidebar dict={dict} permissions={permissions} />
        {/* The sidebar is a fixed-position overlay below lg:, so content only
            needs the ms-60 offset once it's docked in the layout at lg:+. */}
        <div className="flex min-h-screen flex-1 flex-col lg:ms-60">
          <Topbar
            dict={dict}
            role={profile.role}
            fullName={profile.full_name}
            initialUnreadCount={unreadCount ?? 0}
          />
          <div className="flex-1 overflow-y-auto">{children}</div>
        </div>
      </div>
    </MobileSidebarProvider>
  );
}
