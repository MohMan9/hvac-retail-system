"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

type UpdateProductResult = { success: false; error: string };

export async function updateProduct(
  productId: string,
  formData: FormData
): Promise<UpdateProductResult> {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();

  if (!authData.user) {
    return { success: false, error: "Not authenticated" };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, organization_id")
    .eq("id", authData.user.id)
    .single();

  if (!profile) {
    return { success: false, error: "No profile found for this account" };
  }

  if (profile.role !== "manager" && profile.role !== "admin") {
    return { success: false, error: "Only managers and admins can edit products" };
  }

  const name_ar = formData.get("name_ar") as string;
  const name_en = (formData.get("name_en") as string) || null;
  const description_ar = (formData.get("description_ar") as string) || null;
  const description_en = (formData.get("description_en") as string) || null;
  const barcode = formData.get("barcode") as string;
  const unit_of_measure = formData.get("unit_of_measure") as string;
  const warrantyRaw = formData.get("warranty_months") as string;
  const warranty_months = warrantyRaw ? Number(warrantyRaw) : null;

  // 1) Update the product itself.
  const { error: productError } = await supabase
    .from("products")
    .update({
      name_ar,
      name_en,
      description_ar,
      description_en,
      barcode,
      unit_of_measure,
      warranty_months,
    })
    .eq("id", productId)
    .eq("organization_id", profile.organization_id);

  if (productError) {
    return { success: false, error: productError.message };
  }

  // 2) Update pricing. supabase-js has no cross-table transaction, so if
  //    this fails the product details above were already saved — say so.
  const price_wholesale = Number(formData.get("price_wholesale"));
  const price_craftsman = Number(formData.get("price_craftsman"));
  const price_shop = Number(formData.get("price_shop"));
  const price_retail = Number(formData.get("price_retail"));

  const { error: priceError } = await supabase
    .from("product_prices")
    .update({
      price_wholesale,
      price_craftsman,
      price_shop,
      price_retail,
    })
    .eq("product_id", productId);

  if (priceError) {
    return {
      success: false,
      error: `Product details were saved, but pricing failed to update (${priceError.message}).`,
    };
  }

  // 3) Cost fields are admin-only both to view and to submit — RLS on
  //    product_costs blocks non-admins from writing here regardless.
  if (profile.role === "admin") {
    const factoryRaw = formData.get("factory_price") as string;
    const shippingRaw = formData.get("shipping_cost") as string;
    const customsRaw = formData.get("customs_cost") as string;

    if (factoryRaw || shippingRaw || customsRaw) {
      const costValues = {
        factory_price: factoryRaw ? Number(factoryRaw) : 0,
        shipping_cost: shippingRaw ? Number(shippingRaw) : 0,
        customs_cost: customsRaw ? Number(customsRaw) : 0,
      };

      // The product may not have a cost row yet — cost was optional at
      // creation time — so update if one exists, otherwise insert.
      const { data: existingCost } = await supabase
        .from("product_costs")
        .select("product_id")
        .eq("product_id", productId)
        .maybeSingle();

      const costResult = existingCost
        ? await supabase
            .from("product_costs")
            .update(costValues)
            .eq("product_id", productId)
        : await supabase.from("product_costs").insert({
            product_id: productId,
            organization_id: profile.organization_id,
            ...costValues,
          });

      if (costResult.error) {
        return {
          success: false,
          error: `Product and pricing were saved, but cost data failed to update (${costResult.error.message}).`,
        };
      }
    }
  }

  redirect(`/dashboard/products/${productId}`);
}
