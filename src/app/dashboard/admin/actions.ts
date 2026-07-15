"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkPermission } from "@/lib/permissions.server";
import { PERMISSION_KEYS, type Permissions } from "@/lib/permissions";

type CreateUserResult =
  | { success: true }
  | { success: false; error: string };

const VALID_ROLES = ["salesperson", "manager", "admin"] as const;
const MIN_PASSWORD_LENGTH = 6;

function isValidRole(role: string): boolean {
  return (VALID_ROLES as readonly string[]).includes(role);
}

// Reads the 12 permission checkboxes out of a submitted create-user form.
// An unchecked checkbox isn't submitted at all, so absence means "not granted".
function readSubmittedPermissions(formData: FormData): Permissions {
  const submitted: Permissions = {};
  for (const key of PERMISSION_KEYS) {
    submitted[key] = formData.get(`perm_${key}`) != null;
  }
  return submitted;
}

// Applies an explicit permission set to an existing user by flipping the
// `granted` flag on their user_permissions rows (which already exist — the DB
// trigger seeds all 12 from the role default at creation / on role change).
// Uses the admin client; callers MUST verify manage_users first.
async function applyPermissions(
  adminClient: ReturnType<typeof createAdminClient>,
  userId: string,
  desired: Permissions
): Promise<{ error: string } | null> {
  const grantedKeys = PERMISSION_KEYS.filter((key) => desired[key] === true);
  const revokedKeys = PERMISSION_KEYS.filter((key) => desired[key] !== true);

  if (grantedKeys.length > 0) {
    const { error } = await adminClient
      .from("user_permissions")
      .update({ granted: true })
      .eq("user_id", userId)
      .in("permission_key", grantedKeys);
    if (error) {
      return { error: error.message };
    }
  }

  if (revokedKeys.length > 0) {
    const { error } = await adminClient
      .from("user_permissions")
      .update({ granted: false })
      .eq("user_id", userId)
      .in("permission_key", revokedKeys);
    if (error) {
      return { error: error.message };
    }
  }

  return null;
}

// Lockout guard: returns true when at least one OTHER active user in the org
// still has manage_users granted (i.e. it's safe to strip the caller's own
// manage_users). Uses the admin client to see across the whole org.
async function anotherActiveManageUsersExists(
  adminClient: ReturnType<typeof createAdminClient>,
  organizationId: string,
  excludeUserId: string
): Promise<boolean> {
  // Two-step (rather than a PostgREST embed) so we don't depend on a detectable
  // FK from user_permissions to profiles.
  const { data: permissionRows } = await adminClient
    .from("user_permissions")
    .select("user_id")
    .eq("permission_key", "manage_users")
    .eq("granted", true)
    .neq("user_id", excludeUserId);

  const candidateIds = [...new Set((permissionRows ?? []).map((row) => row.user_id))];

  if (candidateIds.length === 0) {
    return false;
  }

  const { data: active } = await adminClient
    .from("profiles")
    .select("id")
    .in("id", candidateIds)
    .eq("organization_id", organizationId)
    .eq("is_active", true);

  return (active ?? []).length > 0;
}

export async function createUser(formData: FormData): Promise<CreateUserResult> {
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;
  const fullName = formData.get("fullName") as string;
  const role = formData.get("role") as string;

  // Validate the role against the known set before it ever reaches Postgres,
  // so a tampered form gives a clean error instead of a raw DB constraint
  // violation (or worse, an unexpected role slipping through).
  // Error strings returned from these actions are stable CODES (matching
  // dictionary keys), so the client can translate them; only opaque DB
  // messages are passed through raw as a fallback.
  if (!isValidRole(role)) {
    return { success: false, error: "err.invalidRole" };
  }

  // Mirror the client's minLength server-side — the client check is only UX.
  if (!password || password.length < MIN_PASSWORD_LENGTH) {
    return { success: false, error: "err.passwordTooShort" };
  }

  // 1) Check the caller is logged in and holds manage_users (the RLS policies
  //    on profiles/user_permissions enforce the same rule as the real backstop).
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();

  if (!authData.user) {
    return { success: false, error: "err.notAuthenticated" };
  }

  if (!(await checkPermission("manage_users"))) {
    return { success: false, error: "err.notManageUsers" };
  }

  const { data: callerProfile } = await supabase
    .from("profiles")
    .select("organization_id")
    .eq("id", authData.user.id)
    .single();

  if (!callerProfile) {
    return { success: false, error: "err.noProfile" };
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

  // 4) The profile insert fired the DB trigger that seeds all 12
  //    user_permissions rows from the chosen role's defaults. Now apply any
  //    per-box overrides the admin made in the create form on top of that.
  const overrideError = await applyPermissions(
    adminClient,
    newUser.user.id,
    readSubmittedPermissions(formData)
  );

  if (overrideError) {
    return { success: false, error: overrideError.error };
  }

  return { success: true };
}

type UpdateUserResult = { success: true } | { success: false; error: string };

type Caller = { error: string } | { callerId: string; organizationId: string };

// Caller must hold manage_users (RLS enforces the same on every write below).
async function requireManageUsers(): Promise<Caller> {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();

  if (!authData.user) {
    return { error: "err.notAuthenticated" } as const;
  }

  if (!(await checkPermission("manage_users"))) {
    return { error: "err.notManageUsers" } as const;
  }

  const { data: callerProfile } = await supabase
    .from("profiles")
    .select("organization_id")
    .eq("id", authData.user.id)
    .single();

  if (!callerProfile) {
    return { error: "err.noProfile" } as const;
  }

  return { callerId: authData.user.id, organizationId: callerProfile.organization_id } as const;
}

export async function updateUserRole(userId: string, role: string): Promise<UpdateUserResult> {
  const caller = await requireManageUsers();

  if ("error" in caller) {
    return { success: false, error: caller.error };
  }

  if (!isValidRole(role)) {
    return { success: false, error: "err.invalidRole" };
  }

  const adminClient = createAdminClient();

  // Lockout guard: changing a role re-seeds that user's permissions to the new
  // role's defaults (DB trigger). If the caller is changing their OWN role to
  // one whose default doesn't grant manage_users, and nobody else active holds
  // it, the org would lose all user-management access — block that.
  if (userId === caller.callerId) {
    // role_default_permissions is presence-based (no `granted` column): a row
    // for (role, 'manage_users') existing means the new role grants it.
    const { data: roleDefault } = await adminClient
      .from("role_default_permissions")
      .select("permission_key")
      .eq("role", role)
      .eq("permission_key", "manage_users")
      .maybeSingle();

    const newRoleGrantsManageUsers = roleDefault != null;

    if (
      !newRoleGrantsManageUsers &&
      !(await anotherActiveManageUsersExists(adminClient, caller.organizationId, caller.callerId))
    ) {
      return { success: false, error: "err.onlyManageUsers" };
    }
  }

  // service_role bypasses RLS — safe because manage_users was verified above,
  // and the update stays scoped to the caller's own org.
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
  const caller = await requireManageUsers();

  if ("error" in caller) {
    return { success: false, error: caller.error };
  }

  if (userId === caller.callerId) {
    return { success: false, error: "err.cannotDeactivateSelf" };
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

  // Flipping the profile flag alone doesn't kill an already-issued session or
  // refresh token — the user could keep working until it expires. Banning the
  // auth user (≈100 years, effectively permanent) invalidates those tokens so
  // deactivation takes effect immediately; reactivating lifts the ban.
  const { error: banError } = await adminClient.auth.admin.updateUserById(userId, {
    ban_duration: isActive ? "none" : "876000h",
  });

  if (banError) {
    return { success: false, error: banError.message };
  }

  return { success: true };
}

// Task 4: overwrite an existing user's permission set to exactly the submitted
// checkbox state (their real, customized state — not role defaults).
export async function updateUserPermissions(
  userId: string,
  desired: Permissions
): Promise<UpdateUserResult> {
  const caller = await requireManageUsers();

  if ("error" in caller) {
    return { success: false, error: caller.error };
  }

  const adminClient = createAdminClient();

  // The target must be in the caller's own org — never edit across orgs.
  const { data: target } = await adminClient
    .from("profiles")
    .select("id, organization_id")
    .eq("id", userId)
    .eq("organization_id", caller.organizationId)
    .maybeSingle();

  if (!target) {
    return { success: false, error: "err.userNotFound" };
  }

  // Lockout guard: an admin can't strip their OWN manage_users if they're the
  // last active user in the org who has it granted.
  if (
    userId === caller.callerId &&
    desired["manage_users"] !== true &&
    !(await anotherActiveManageUsersExists(adminClient, caller.organizationId, caller.callerId))
  ) {
    return { success: false, error: "err.onlyManageUsers" };
  }

  const applyError = await applyPermissions(adminClient, userId, desired);

  if (applyError) {
    return { success: false, error: applyError.error };
  }

  return { success: true };
}
