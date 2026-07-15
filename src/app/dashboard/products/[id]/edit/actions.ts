"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { checkPermission } from "@/lib/permissions.server";
import { parseSerialSuffixLength, truncateBarcode } from "@/lib/barcode";
import {
  buildProductImageStoragePath,
  cleanProductImageFilename,
  parseProductImageStoragePath,
  PRODUCT_IMAGE_BUCKETS,
} from "@/lib/product-images";
import { redirect } from "next/navigation";

type UpdateProductResult = { success: false; error: string };

type ImageActionResult = { success: true } | { success: false; error: string };

export async function updateProduct(
  productId: string,
  formData: FormData
): Promise<UpdateProductResult> {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();

  if (!authData.user) {
    return { success: false, error: "Not authenticated" };
  }

  if (!(await checkPermission("manage_products"))) {
    return { success: false, error: "You don't have permission to manage products" };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("organization_id")
    .eq("id", authData.user.id)
    .single();

  if (!profile) {
    return { success: false, error: "No profile found for this account" };
  }

  const name_ar = formData.get("name_ar") as string;
  const name_en = (formData.get("name_en") as string) || null;
  const description_ar = (formData.get("description_ar") as string) || null;
  const description_en = (formData.get("description_en") as string) || null;
  const unit_of_measure = formData.get("unit_of_measure") as string;
  const warrantyRaw = formData.get("warranty_months") as string;
  const warranty_months = warrantyRaw ? Number(warrantyRaw) : null;

  // For serialized products the stored barcode is the shared prefix — strip the
  // per-unit suffix (re-scanning a new full code while serial length > 0
  // truncates the same way).
  const serial_suffix_length = parseSerialSuffixLength(formData.get("serial_suffix_length"));
  const barcode = truncateBarcode(formData.get("barcode") as string, serial_suffix_length);

  // 1) Update the product itself.
  const { error: productError } = await supabase
    .from("products")
    .update({
      name_ar,
      name_en,
      description_ar,
      description_en,
      barcode,
      serial_suffix_length,
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

  // Upsert (not update): a product created before pricing existed, or one
  // whose price row never got created, has no product_prices row yet — a plain
  // update would silently match zero rows and lose the edit. onConflict on the
  // product_id key updates the existing row or inserts a new one.
  const { error: priceError } = await supabase
    .from("product_prices")
    .upsert(
      {
        product_id: productId,
        organization_id: profile.organization_id,
        price_wholesale,
        price_craftsman,
        price_shop,
        price_retail,
      },
      { onConflict: "product_id" }
    );

  if (priceError) {
    return {
      success: false,
      error: `Product details were saved, but pricing failed to update (${priceError.message}).`,
    };
  }

  // 3) Cost fields are admin-only both to view and to submit — RLS on
  //    product_costs blocks non-admins from writing here regardless.
  if (await checkPermission("view_product_costs")) {
    // `formData.get` returns null when a field is genuinely absent from the
    // request, and "" when it's submitted empty. The edit form always submits
    // all three cost fields, so we must NOT treat "all blank" as "no change" —
    // that's the admin explicitly clearing the cost. Only skip entirely when
    // none of the fields were submitted at all.
    const factoryRaw = formData.get("factory_price") as string | null;
    const shippingRaw = formData.get("shipping_cost") as string | null;
    const customsRaw = formData.get("customs_cost") as string | null;

    const anySubmitted = factoryRaw !== null || shippingRaw !== null || customsRaw !== null;
    const anyFilled =
      (factoryRaw ?? "").trim() !== "" ||
      (shippingRaw ?? "").trim() !== "" ||
      (customsRaw ?? "").trim() !== "";

    if (anySubmitted && anyFilled) {
      // At least one cost value is set — upsert the row (creates it if the
      // product had no cost row yet, since cost was optional at creation).
      const { error: costError } = await supabase.from("product_costs").upsert(
        {
          product_id: productId,
          organization_id: profile.organization_id,
          factory_price: factoryRaw ? Number(factoryRaw) : 0,
          shipping_cost: shippingRaw ? Number(shippingRaw) : 0,
          customs_cost: customsRaw ? Number(customsRaw) : 0,
        },
        { onConflict: "product_id" }
      );

      if (costError) {
        return {
          success: false,
          error: `Product and pricing were saved, but cost data failed to update (${costError.message}).`,
        };
      }
    } else if (anySubmitted) {
      // All three cost fields submitted blank — the admin cleared the cost, so
      // remove any existing cost row rather than silently keeping old values.
      const { error: costError } = await supabase
        .from("product_costs")
        .delete()
        .eq("product_id", productId);

      if (costError) {
        return {
          success: false,
          error: `Product and pricing were saved, but cost data failed to clear (${costError.message}).`,
        };
      }
    }
  }

  redirect(`/dashboard/products/${productId}`);
}

// Shared preamble for the image actions: verify auth + manage_products (RLS on
// product_images is the real backstop). Returns the session client on success.
async function requireImageManager(): Promise<
  { supabase: Awaited<ReturnType<typeof createClient>> } | { error: string }
> {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();

  if (!authData.user) {
    return { error: "Not authenticated" };
  }

  if (!(await checkPermission("manage_products"))) {
    return { error: "You don't have permission to manage products" };
  }

  return { supabase };
}

// Upload one or more images for an existing product. Mirrors the create form's
// mechanism: Supabase Storage under product-images/{org_id}/{product_id}/, with
// a matching product_images row per file. New uploads are is_primary = false,
// UNLESS the product had zero images before — then the first new one becomes
// primary automatically.
export async function uploadProductImages(
  productId: string,
  formData: FormData
): Promise<ImageActionResult> {
  const guard = await requireImageManager();
  if ("error" in guard) {
    return { success: false, error: guard.error };
  }
  const { supabase } = guard;

  const { data: authData } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from("profiles")
    .select("organization_id")
    .eq("id", authData.user!.id)
    .single();

  if (!profile) {
    return { success: false, error: "No profile found for this account" };
  }

  // Confirm the product exists in the caller's org before building paths.
  const { data: product } = await supabase
    .from("products")
    .select("id")
    .eq("id", productId)
    .eq("organization_id", profile.organization_id)
    .single();

  if (!product) {
    return { success: false, error: "Product not found" };
  }

  const imageFiles = formData
    .getAll("images")
    .filter((value): value is File => value instanceof File && value.size > 0);

  if (imageFiles.length === 0) {
    return { success: false, error: "Choose at least one image to upload." };
  }

  // Existing images decide the primary flag and the next sort_order.
  const { data: existing } = await supabase
    .from("product_images")
    .select("id, sort_order")
    .eq("product_id", productId);

  const hadImages = (existing ?? []).length > 0;
  let nextSortOrder =
    (existing ?? []).reduce((max, row) => Math.max(max, Number(row.sort_order ?? 0)), -1) + 1;

  const failures: string[] = [];
  let uploadedCount = 0;

  for (const file of imageFiles) {
    const filename = cleanProductImageFilename(file.name);
    const objectPath = `${profile.organization_id}/${productId}/${filename}`;
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
      failures.push(`${file.name}: storage upload failed (${bucketErrors.join("; ")})`);
      continue;
    }

    // Primary only when the product had NO images before and this is the first
    // one we successfully add in this batch.
    const isPrimary = !hadImages && uploadedCount === 0;

    const { error: imageError } = await supabase.from("product_images").insert({
      product_id: productId,
      storage_path: uploadedStoragePath,
      is_primary: isPrimary,
      sort_order: nextSortOrder,
    });

    if (imageError) {
      failures.push(`${file.name}: database row failed (${imageError.message})`);
      continue;
    }

    nextSortOrder += 1;
    uploadedCount += 1;
  }

  revalidatePath(`/dashboard/products/${productId}/edit`);

  if (uploadedCount === 0) {
    return { success: false, error: `Upload failed: ${failures.join("; ")}` };
  }

  if (failures.length > 0) {
    return {
      success: false,
      error: `${uploadedCount} image(s) uploaded, but some failed: ${failures.join("; ")}`,
    };
  }

  return { success: true };
}

// Make one image the product's primary and clear the flag on every other image
// for that product. supabase-js has no cross-row transaction, so this is two
// sequential updates with error handling between them.
export async function setPrimaryImage(imageId: string): Promise<ImageActionResult> {
  const guard = await requireImageManager();
  if ("error" in guard) {
    return { success: false, error: guard.error };
  }
  const { supabase } = guard;

  const { data: image } = await supabase
    .from("product_images")
    .select("id, product_id")
    .eq("id", imageId)
    .single();

  if (!image) {
    return { success: false, error: "Image not found" };
  }

  const { error: clearError } = await supabase
    .from("product_images")
    .update({ is_primary: false })
    .eq("product_id", image.product_id);

  if (clearError) {
    return { success: false, error: clearError.message };
  }

  const { error: setError } = await supabase
    .from("product_images")
    .update({ is_primary: true })
    .eq("id", imageId);

  if (setError) {
    return { success: false, error: setError.message };
  }

  revalidatePath(`/dashboard/products/${image.product_id}/edit`);
  return { success: true };
}

// Delete an image: remove the Storage object AND the product_images row. If the
// deleted image was primary and others remain, promote the next one (lowest
// sort_order) to primary.
export async function deleteProductImage(imageId: string): Promise<ImageActionResult> {
  const guard = await requireImageManager();
  if ("error" in guard) {
    return { success: false, error: guard.error };
  }
  const { supabase } = guard;

  const { data: image } = await supabase
    .from("product_images")
    .select("id, product_id, storage_path, is_primary")
    .eq("id", imageId)
    .single();

  if (!image) {
    return { success: false, error: "Image not found" };
  }

  // Best-effort storage removal first — if the object is already gone we still
  // want to drop the row rather than leave it dangling.
  const { bucket, objectPath } = parseProductImageStoragePath(image.storage_path);
  await supabase.storage.from(bucket).remove([objectPath]);

  const { error: deleteError } = await supabase
    .from("product_images")
    .delete()
    .eq("id", imageId);

  if (deleteError) {
    return { success: false, error: deleteError.message };
  }

  // If we removed the primary image, promote the next remaining one.
  if (image.is_primary) {
    const { data: remaining } = await supabase
      .from("product_images")
      .select("id")
      .eq("product_id", image.product_id)
      .order("sort_order", { ascending: true })
      .limit(1);

    const next = remaining?.[0];
    if (next) {
      await supabase
        .from("product_images")
        .update({ is_primary: true })
        .eq("id", next.id);
    }
  }

  revalidatePath(`/dashboard/products/${image.product_id}/edit`);
  return { success: true };
}
