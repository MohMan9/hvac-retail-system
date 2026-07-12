import { createClient } from "@/lib/supabase/server";
import { AdminForm } from "./admin-form";
import { UserList } from "./user-list";
import { getServerDictionary } from "@/lib/i18n/get-server-locale";
import { cardClass, mutedTextClass, pageTitleClass, sectionTitleClass } from "@/lib/ui";

type AdminUserRow = {
  id: string;
  full_name: string | null;
  email: string | null;
  role: string;
  is_active: boolean;
};

export default async function AdminPage() {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  const { dict } = await getServerDictionary();

  const { data: profile } = authData.user
    ? await supabase
        .from("profiles")
        .select("role, organization_id")
        .eq("id", authData.user.id)
        .single()
    : { data: null };

  // /dashboard/admin is nested under the dashboard layout, but the nav link
  // being hidden for non-admins doesn't stop someone navigating here
  // directly by URL. Enforce it here too, server-side.
  if (!authData.user || !profile || profile.role !== "admin") {
    return (
      <main className="mx-auto max-w-md px-8 py-6">
        <p className={mutedTextClass}>{dict["admin.notAuthorized"]}</p>
      </main>
    );
  }

  let users: AdminUserRow[] = [];

  const { data: usersWithEmail, error: usersError } = await supabase
    .from("profiles")
    .select("id, full_name, email, role, is_active")
    .eq("organization_id", profile.organization_id)
    .order("full_name");

  if (!usersError && usersWithEmail) {
    users = usersWithEmail as AdminUserRow[];
  } else {
    // "email" likely isn't a column on profiles yet — fall back to the
    // columns we know exist rather than erroring the whole page.
    const { data: usersWithoutEmail } = await supabase
      .from("profiles")
      .select("id, full_name, role, is_active")
      .eq("organization_id", profile.organization_id)
      .order("full_name");

    users = (usersWithoutEmail ?? []).map((user) => ({ ...user, email: null }));
  }

  return (
    <main className="mx-auto max-w-4xl px-8 py-6">
      <h1 className={`${pageTitleClass} mb-6`}>{dict["admin.createUserTitle"]}</h1>
      <div className={`${cardClass} p-6`}>
        <AdminForm />
      </div>

      <h2 className={`${sectionTitleClass} mb-4 mt-10`}>{dict["admin.usersTitle"]}</h2>
      <UserList users={users} currentUserId={authData.user.id} dict={dict} />
    </main>
  );
}
