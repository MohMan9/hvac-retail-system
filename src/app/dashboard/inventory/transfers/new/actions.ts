"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

type CreateStockTransferResult = { success: false; error: string };

export async function createStockTransfer(formData: FormData): Promise<CreateStockTransferResult> {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();

  if (!authData.user) {
    return { success: false, error: "Not authenticated" };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("organization_id")
    .eq("id", authData.user.id)
    .single();

  if (!profile) {
    return { success: false, error: "No profile found for this account" };
  }

  const productId = formData.get("product_id") as string;
  const fromWarehouseId = (formData.get("from_warehouse") as string) || null;
  const toWarehouseId = (formData.get("to_warehouse") as string) || null;
  const quantity = Number(formData.get("quantity"));
  const transferDate = formData.get("transfer_date") as string;
  const note = (formData.get("note") as string) || null;

  // Re-check server-side too — the client-side check is only a UX shortcut.
  if (fromWarehouseId && toWarehouseId && fromWarehouseId === toWarehouseId) {
    return { success: false, error: "From and To warehouse cannot be the same." };
  }

  // Never trust a client-submitted user id for created_by — use the
  // session's own id. Inventory quantities are NOT written here: a DB
  // trigger on stock_transfers handles deducting/adding to `inventory`
  // once this row is inserted.
  const { error } = await supabase.from("stock_transfers").insert({
    organization_id: profile.organization_id,
    product_id: productId,
    from_warehouse_id: fromWarehouseId,
    to_warehouse_id: toWarehouseId,
    quantity,
    transfer_date: transferDate,
    note,
    created_by: authData.user.id,
  });

  if (error) {
    // The trigger raises a plain-text exception (e.g. no inventory row at
    // the source warehouse for this product) — that message is already
    // meant for a human, so surface it as-is instead of a generic failure.
    return { success: false, error: error.message };
  }

  redirect("/dashboard/inventory");
}
