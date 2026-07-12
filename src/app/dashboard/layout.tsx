import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getServerDictionary } from "@/lib/i18n/get-server-locale";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";

export default async function DashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();

  if (!authData.user) {
    redirect("/signin");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, full_name")
    .eq("id", authData.user.id)
    .single();

  if (!profile) {
    redirect("/signin");
  }

  const { dict } = await getServerDictionary();

  const { count: unreadCount } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("recipient_id", authData.user.id)
    .eq("is_read", false);

  return (
    <div className="flex min-h-screen bg-slate-50">
      <Sidebar dict={dict} role={profile.role} />
      <div className="flex min-h-screen flex-1 flex-col ms-60">
        <Topbar
          dict={dict}
          role={profile.role}
          fullName={profile.full_name}
          initialUnreadCount={unreadCount ?? 0}
        />
        <div className="flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}
