"use server";

import { createClient } from "@/lib/supabase/server";
import {
  buildProductImageStoragePath,
  cleanProductImageFilename,
  PRODUCT_IMAGE_BUCKETS,
} from "@/lib/product-images";
import { redirect } from "next/navigation";

type CreateProductResult = { success: false; error: string };

export async function createProduct(formData: FormData): Promise<CreateProductResult> {
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
    return { success: false, error: "Only managers and admins can create products" };
  }

  const name_ar = formData.get("name_ar") as string;
  const name_en = (formData.get("name_en") as string) || null;
  const description_ar = (formData.get("description_ar") as string) || null;
  const description_en = (formData.get("description_en") as string) || null;
  const barcode = formData.get("barcode") as string;
  const unit_of_measure = formData.get("unit_of_measure") as string;
  const warrantyRaw = formData.get("warranty_months") as string;
  const warranty_months = warrantyRaw ? Number(warrantyRaw) : null;

  // 1) Create the product itself.
  const { data: newProduct, error: productError } = await supabase
    .from("products")
    .insert({
      organization_id: profile.organization_id,
      name_ar,
      name_en,
      description_ar,
      description_en,
      barcode,
      unit_of_measure,
      warranty_months,
    })
    .select("id")
    .single();

  if (productError || !newProduct) {
    return { success: false, error: productError?.message ?? "Failed to create product" };
  }

  const imageFiles = formData
    .getAll("images")
    .filter((value): value is File => value instanceof File && value.size > 0);
  const imageFailures: string[] = [];

  if (imageFiles.length > 0) {
    for (const [index, file] of imageFiles.entries()) {
      const filename = cleanProductImageFilename(file.name);
      const objectPath = `${profile.organization_id}/${newProduct.id}/${filename}`;
      const imageBody = await file.arrayBuffer();
      let uploadedStoragePath: string | null = null;
      const bucketErrors: string[] = [];

      for (const bucket of PRODUCT_IMAGE_BUCKETS) {
        const { error: uploadError } = await supabase.storage
          .from(bucket)
          .upload(objectPath, imageBody, {
            contentType: file.type || undefined,
            upsert: false,
          });

        if (!uploadError) {
          uploadedStoragePath = buildProductImageStoragePath(bucket, objectPath);
          break;
        }

        bucketErrors.push(`${bucket}: ${uploadError.message}`);
      }

      if (!uploadedStoragePath) {
        imageFailures.push(`${file.name}: storage upload failed (${bucketErrors.join("; ")})`);
        continue;
      }

      const { error: imageError } = await supabase.from("product_images").insert({
        product_id: newProduct.id,
        storage_path: uploadedStoragePath,
        is_primary: index === 0,
        sort_order: index,
      });

      if (imageError) {
        imageFailures.push(`${file.name}: database row failed (${imageError.message})`);
      }
    }
  }

  // 2) Create the pricing row. supabase-js has no cross-table transaction, so
  //    if this fails the product row already exists — tell the user exactly
  //    that instead of a generic error, so they know to go edit it.
  const price_wholesale = Number(formData.get("price_wholesale"));
  const price_craftsman = Number(formData.get("price_craftsman"));
  const price_shop = Number(formData.get("price_shop"));
  const price_retail = Number(formData.get("price_retail"));

  const { error: priceError } = await supabase.from("product_prices").insert({
    product_id: newProduct.id,
    organization_id: profile.organization_id,
    price_wholesale,
    price_craftsman,
    price_shop,
    price_retail,
  });

  if (priceError) {
    return {
      success: false,
      error: `Product was created, but pricing failed to save (${priceError.message}). Edit the product to add pricing.`,
    };
  }

  // 3) Cost fields are admin-only both to view and to submit. Even if a
  //    tampered client sent these fields anyway, RLS on product_costs blocks
  //    non-admins from writing here regardless — this check is just to avoid
  //    a pointless insert attempt for non-admins.
  if (profile.role === "admin") {
    const factoryRaw = formData.get("factory_price") as string;
    const shippingRaw = formData.get("shipping_cost") as string;
    const customsRaw = formData.get("customs_cost") as string;

    if (factoryRaw || shippingRaw || customsRaw) {
      const { error: costError } = await supabase.from("product_costs").insert({
        product_id: newProduct.id,
        organization_id: profile.organization_id,
        factory_price: factoryRaw ? Number(factoryRaw) : 0,
        shipping_cost: shippingRaw ? Number(shippingRaw) : 0,
        customs_cost: customsRaw ? Number(customsRaw) : 0,
      });

      if (costError) {
        return {
          success: false,
          error: `Product and pricing were created, but cost data failed to save (${costError.message}). Edit the product to add costs.`,
        };
      }
    }
  }

  let successMessage =
    imageFiles.length > 0 && imageFailures.length > 0
      ? `Product created. ${imageFailures.length} of ${imageFiles.length} images failed: ${imageFailures.join("; ")}`
      : "Product created.";

  // 4) Optional initial stock. Only insert into stock_transfers — never
  //    write to `inventory` directly, a DB trigger updates it from this row.
  //    A failure here shouldn't undo the product/pricing/cost work already
  //    done, so report it alongside the success message instead of erroring.
  const initialWarehouseId = (formData.get("initial_warehouse_id") as string) || null;
  const initialQuantityRaw = formData.get("initial_quantity") as string;
  const initialQuantity = initialQuantityRaw ? Number(initialQuantityRaw) : 0;

  if (initialWarehouseId && initialQuantity > 0) {
    const { error: stockError } = await supabase.from("stock_transfers").insert({
      organization_id: profile.organization_id,
      product_id: newProduct.id,
      from_warehouse_id: null,
      to_warehouse_id: initialWarehouseId,
      quantity: initialQuantity,
      transfer_date: new Date().toISOString().slice(0, 10),
      note: "Initial stock",
      created_by: authData.user.id,
    });

    if (stockError) {
      successMessage = `${successMessage} Initial stock could not be added: ${stockError.message}. Add it manually from the warehouse page.`;
    }
  }

  redirect(`/dashboard/products?message=${encodeURIComponent(successMessage)}`);
}
