"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { checkPermission } from "@/lib/permissions.server";
import { overlapsExistingRule, type OfferInput } from "@/lib/offers";

type UpdateOfferResult = { success: false; error: string };

export async function updateOffer(
  ruleId: string,
  input: OfferInput
): Promise<UpdateOfferResult> {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();

  if (!authData.user) {
    return { success: false, error: "Not authenticated" };
  }

  if (!(await checkPermission("manage_products"))) {
    return { success: false, error: "You don't have permission to manage offers" };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("organization_id")
    .eq("id", authData.user.id)
    .single();

  if (!profile) {
    return { success: false, error: "No profile found for this account" };
  }

  if (!input.product_id) {
    return { success: false, error: "Choose a product for this offer." };
  }

  if (input.min_qty < 0 || input.max_qty < input.min_qty || input.price < 0) {
    return { success: false, error: "Enter a valid quantity range and price." };
  }

  // Re-check overlap server-side, excluding this same rule from the comparison.
  const { data: existing } = await supabase
    .from("quantity_price_rules")
    .select("id, product_id, min_qty, max_qty")
    .eq("organization_id", profile.organization_id)
    .eq("product_id", input.product_id);

  if (overlapsExistingRule(existing ?? [], input.product_id, input.min_qty, input.max_qty, ruleId)) {
    return {
      success: false,
      error: "This quantity range overlaps an existing offer for this product.",
    };
  }

  const { error } = await supabase
    .from("quantity_price_rules")
    .update({
      product_id: input.product_id,
      min_qty: input.min_qty,
      max_qty: input.max_qty,
      price: input.price,
    })
    .eq("id", ruleId)
    .eq("organization_id", profile.organization_id);

  if (error) {
    return { success: false, error: error.message };
  }

  redirect("/dashboard/offers");
}
