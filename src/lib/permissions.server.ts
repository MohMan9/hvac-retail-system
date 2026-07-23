// Server-only permission fetchers. Kept separate from `permissions.ts` so the
// pure helpers there stay importable by Client Components without dragging
// `next/headers` (via the server Supabase client) into the client bundle.
import { cache } from "react";
import { getCurrentUser } from "@/lib/auth.server";
import { createClient } from "@/lib/supabase/server";
import {
  emptyPermissions,
  type PermissionKey,
  type Permissions,
} from "@/lib/permissions";

// Fetch the current user's full permission set in ONE query against
// `user_permissions`, returned as a flat { [key]: boolean } object. Call this
// once per Server Component page and pass it down — do NOT call the
// has_permission() RPC 12 times per page. RLS remains the real backstop.
export const getEffectivePermissions = cache(async (): Promise<Permissions> => {
  const supabase = await createClient();

  const authData = await getCurrentUser();
  if (!authData.user) {
    return emptyPermissions();
  }

  const { data } = await supabase
    .from("user_permissions")
    .select("permission_key, granted")
    .eq("user_id", authData.user.id);

  const permissions = emptyPermissions();
  for (const row of data ?? []) {
    permissions[row.permission_key] = row.granted === true;
  }
  return permissions;
});

// Server Action guard: returns whether the current user has the given
// permission, using the same has_permission() RPC the RLS policies call. Use
// this in a Server Action BEFORE mutating — it's the app-level half of a
// defense-in-depth pair with the RLS policy, not the only line of defense.
export async function checkPermission(key: PermissionKey): Promise<boolean> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("has_permission", {
    p_permission_key: key,
  });

  if (error) {
    return false;
  }

  return data === true;
}
