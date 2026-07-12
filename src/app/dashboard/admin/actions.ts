"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

type CreateUserResult =
  | { success: true }
  | { success: false; error: string };

export async function createUser(formData: FormData): Promise<CreateUserResult> {
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;
  const fullName = formData.get("fullName") as string;
  const role = formData.get("role") as string;

  // 1) Check the caller is logged in and is an admin, using the
  //    session-aware client (respects RLS, reads auth.uid()).
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();

  if (!authData.user) {
    return { success: false, error: "Not authenticated" };
  }

  const { data: callerProfile } = await supabase
    .from("profiles")
    .select("role, organization_id")
    .eq("id", authData.user.id)
    .single();

  if (!callerProfile || callerProfile.role !== "admin") {
    return { success: false, error: "Only admins can create users" };
  }

  // 2) Use the admin client (service_role) to actually create the auth user.
  //    This bypasses RLS/signup restrictions — safe here because we already
  //    verified the caller is an admin above.
  const adminClient = createAdminClient();

  const { data: newUser, error: createError } =
    await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // skip email verification, admin-created accounts
    });

  if (createError || !newUser.user) {
    return { success: false, error: createError?.message ?? "Failed to create user" };
  }

  // 3) Insert the profile row, scoped to the SAME organization as the admin
  //    who is creating this account (never trust a client-sent org id).
  let { error: profileError } = await adminClient.from("profiles").insert({
    id: newUser.user.id,
    organization_id: callerProfile.organization_id,
    full_name: fullName,
    role,
    email,
  });

  if (profileError && /column .*email.* does not exist/i.test(profileError.message)) {
    // "email" isn't a column on profiles yet in this database — fall back
    // to the columns we know exist rather than failing the whole signup.
    ({ error: profileError } = await adminClient.from("profiles").insert({
      id: newUser.user.id,
      organization_id: callerProfile.organization_id,
      full_name: fullName,
      role,
    }));
  }

  if (profileError) {
    // Rollback: remove the auth user if the profile insert failed,
    // so we don't end up with an orphaned auth account with no profile.
    await adminClient.auth.admin.deleteUser(newUser.user.id);
    return { success: false, error: profileError.message };
  }

  return { success: true };
}

type UpdateUserResult = { success: true } | { success: false; error: string };

type CallerAdmin = { error: string } | { callerId: string; organizationId: string };

async function requireCallerAdmin(): Promise<CallerAdmin> {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();

  if (!authData.user) {
    return { error: "Not authenticated" } as const;
  }

  const { data: callerProfile } = await supabase
    .from("profiles")
    .select("role, organization_id")
    .eq("id", authData.user.id)
    .single();

  if (!callerProfile || callerProfile.role !== "admin") {
    return { error: "Only admins can do this" } as const;
  }

  return { callerId: authData.user.id, organizationId: callerProfile.organization_id } as const;
}

export async function updateUserRole(userId: string, role: string): Promise<UpdateUserResult> {
  const caller = await requireCallerAdmin();

  if ("error" in caller) {
    return { success: false, error: caller.error };
  }

  // Use the admin client (service_role) to bypass RLS for updating another
  // user's row — safe here because we already verified the caller is an
  // admin above, and the update stays scoped to the caller's own org.
  const adminClient = createAdminClient();

  const { error } = await adminClient
    .from("profiles")
    .update({ role })
    .eq("id", userId)
    .eq("organization_id", caller.organizationId);

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true };
}

export async function toggleUserActive(
  userId: string,
  isActive: boolean
): Promise<UpdateUserResult> {
  const caller = await requireCallerAdmin();

  if ("error" in caller) {
    return { success: false, error: caller.error };
  }

  if (userId === caller.callerId) {
    return { success: false, error: "You cannot deactivate your own account" };
  }

  const adminClient = createAdminClient();

  const { error } = await adminClient
    .from("profiles")
    .update({ is_active: isActive })
    .eq("id", userId)
    .eq("organization_id", caller.organizationId);

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true };
}
