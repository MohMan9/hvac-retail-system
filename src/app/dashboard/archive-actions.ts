"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth.server";
import { checkPermission } from "@/lib/permissions.server";
import type { PermissionKey } from "@/lib/permissions";

// The delete_or_archive_* RPCs try a hard DELETE first and fall back to setting
// is_archived = true when a foreign key blocks it (i.e. the row has real
// transaction history that must be preserved). They return which path was taken.
export type ArchiveOutcome = "deleted" | "archived";

export type ArchiveResult =
  | { success: true; result: ArchiveOutcome }
  | { success: false; error: string };

export type RestoreResult = { success: true } | { success: false; error: string };

// Shared guard: authenticated, plus the entity's permission where one applies.
// Customers deliberately require no extra permission — that matches the existing
// customers RLS, which lets any authenticated role write them.
async function guard(permission: PermissionKey | null): Promise<string | null> {
  const authData = await getCurrentUser();

  if (!authData.user) {
    return "Not authenticated";
  }

  if (permission && !(await checkPermission(permission))) {
    return "You don't have permission to do this";
  }

  return null;
}

async function runDeleteOrArchive(
  fn: string,
  paramName: string,
  id: string,
  permission: PermissionKey | null,
  revalidate: string[]
): Promise<ArchiveResult> {
  const denied = await guard(permission);
  if (denied) {
    return { success: false, error: denied };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc(fn, { [paramName]: id });

  if (error) {
    return { success: false, error: error.message };
  }

  for (const path of revalidate) {
    revalidatePath(path);
  }

  // Anything other than an explicit "archived" means the row was really removed.
  return { success: true, result: data === "archived" ? "archived" : "deleted" };
}

async function runUnarchive(
  fn: string,
  paramName: string,
  id: string,
  permission: PermissionKey | null,
  revalidate: string[]
): Promise<RestoreResult> {
  const denied = await guard(permission);
  if (denied) {
    return { success: false, error: denied };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc(fn, { [paramName]: id });

  if (error) {
    return { success: false, error: error.message };
  }

  for (const path of revalidate) {
    revalidatePath(path);
  }

  return { success: true };
}

export async function deleteOrArchiveProduct(productId: string): Promise<ArchiveResult> {
  return runDeleteOrArchive(
    "delete_or_archive_product",
    "p_product_id",
    productId,
    "manage_products",
    ["/dashboard/products"]
  );
}

export async function deleteOrArchiveWarehouse(warehouseId: string): Promise<ArchiveResult> {
  return runDeleteOrArchive(
    "delete_or_archive_warehouse",
    "p_warehouse_id",
    warehouseId,
    "manage_warehouses",
    ["/dashboard/warehouses"]
  );
}

export async function deleteOrArchiveCustomer(customerId: string): Promise<ArchiveResult> {
  return runDeleteOrArchive(
    "delete_or_archive_customer",
    "p_customer_id",
    customerId,
    null,
    ["/dashboard/customers"]
  );
}

export async function unarchiveProduct(productId: string): Promise<RestoreResult> {
  return runUnarchive("unarchive_product", "p_product_id", productId, "manage_products", [
    "/dashboard/products",
  ]);
}

export async function unarchiveWarehouse(warehouseId: string): Promise<RestoreResult> {
  return runUnarchive("unarchive_warehouse", "p_warehouse_id", warehouseId, "manage_warehouses", [
    "/dashboard/warehouses",
  ]);
}

export async function unarchiveCustomer(customerId: string): Promise<RestoreResult> {
  return runUnarchive("unarchive_customer", "p_customer_id", customerId, null, [
    "/dashboard/customers",
  ]);
}
