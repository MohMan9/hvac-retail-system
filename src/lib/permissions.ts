// Granular permission system — client-safe core.
//
// The database is the real security boundary: every relevant RLS policy calls
// the Postgres `has_permission(key)` function, which reads `user_permissions`.
// These app-level helpers exist so the UI can show/hide actions and Server
// Actions can fail fast BEFORE hitting the DB — they are redundant with, not a
// replacement for, the RLS policies.
//
// `role` still exists on profiles (for seeding defaults and as a seniority
// label) but is no longer the authorization mechanism for the features below.
//
// This module is import-safe from both Server and Client Components. The
// server-only fetchers live in `permissions.server.ts` so that a "use client"
// component importing the pure helpers below never pulls `next/headers` into
// the client bundle.

// The 12 permission keys, matching the `permission_keys` table and the
// `user_permissions.permission_key` values in the database.
export const PERMISSION_KEYS = [
  "manage_products",
  "view_product_costs",
  "view_loaded_cost",
  "manage_warehouses",
  "manage_inventory_transfers",
  "approve_reject_discounts",
  "manage_services",
  "manage_expenses",
  "manage_partners",
  "view_monthly_report",
  "manage_cash_register",
  "manage_users",
] as const;

export type PermissionKey = (typeof PERMISSION_KEYS)[number];

// A flat map of every permission key to whether it's granted for a user.
export type Permissions = Record<string, boolean>;

// Every key defaulted to false — used as the base so a missing row reads as
// "not granted" rather than undefined.
export function emptyPermissions(): Permissions {
  const permissions: Permissions = {};
  for (const key of PERMISSION_KEYS) {
    permissions[key] = false;
  }
  return permissions;
}

// Pure check usable on BOTH server and client. Client components receive the
// permissions object as a prop from their parent Server Component and call
// this — they never re-fetch.
export function hasPermission(
  permissions: Permissions | null | undefined,
  key: PermissionKey
): boolean {
  return permissions?.[key] === true;
}
