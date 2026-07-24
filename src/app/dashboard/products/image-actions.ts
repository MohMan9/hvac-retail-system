"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { checkPermission } from "@/lib/permissions.server";
import {
  buildProductImageStoragePath,
  PRODUCT_IMAGE_BUCKETS,
} from "@/lib/product-images";

type UploadedImage = {
  bucket: string;
  objectPath: string;
};

type ImageManagerContext =
  | {
      supabase: Awaited<ReturnType<typeof createClient>>;
      organizationId: string;
    }
  | { error: string };

async function requireImageManager(productId: string): Promise<ImageManagerContext> {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();

  if (!authData.user) {
    return { error: "Not authenticated" };
  }

  if (!(await checkPermission("manage_products"))) {
    return { error: "You don't have permission to manage products" };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("organization_id")
    .eq("id", authData.user.id)
    .single();

  if (!profile) {
    return { error: "No profile found for this account" };
  }

  const { data: product } = await supabase
    .from("products")
    .select("id")
    .eq("id", productId)
    .eq("organization_id", profile.organization_id)
    .single();

  if (!product) {
    return { error: "Product not found" };
  }

  return { supabase, organizationId: profile.organization_id };
}

// The browser needs only this already-RLS-protected folder prefix before it
// uploads directly to Supabase Storage. Image bytes never cross a Next.js or
// Vercel function.
export async function getProductImageUploadContext(
  productId: string
): Promise<
  { success: true; organizationId: string } | { success: false; error: string }
> {
  const context = await requireImageManager(productId);

  if ("error" in context) {
    return { success: false, error: context.error };
  }

  return { success: true, organizationId: context.organizationId };
}

// Record successfully uploaded Storage objects in product_images. Every path
// is checked against the authenticated user's real organization and product;
// client-supplied paths outside that folder are rejected.
export async function registerProductImageUploads(
  productId: string,
  uploads: UploadedImage[]
): Promise<{ success: true; uploadedCount: number } | { success: false; error: string }> {
  if (uploads.length === 0) {
    return { success: false, error: "No uploaded images were provided." };
  }

  if (uploads.length > 20) {
    return { success: false, error: "Upload at most 20 images at a time." };
  }

  const context = await requireImageManager(productId);

  if ("error" in context) {
    return { success: false, error: context.error };
  }

  const { supabase, organizationId } = context;
  const expectedPrefix = `${organizationId}/${productId}/`;
  const allowedBuckets = new Set<string>(PRODUCT_IMAGE_BUCKETS);
  const validUploads = uploads.every(
    ({ bucket, objectPath }) => {
      const filename = objectPath.slice(expectedPrefix.length);
      return (
        allowedBuckets.has(bucket) &&
        objectPath.startsWith(expectedPrefix) &&
        filename.length > 0 &&
        !filename.includes("/")
      );
    }
  );

  if (!validUploads) {
    return { success: false, error: "Invalid product image upload path." };
  }

  const storagePaths = uploads.map(({ bucket, objectPath }) =>
    buildProductImageStoragePath(bucket, objectPath)
  );

  // Make retries idempotent if the browser lost the response after a successful
  // insert: paths already registered for this product are not inserted twice.
  const { data: alreadyRegistered } = await supabase
    .from("product_images")
    .select("storage_path")
    .eq("product_id", productId)
    .in("storage_path", storagePaths);
  const registeredPaths = new Set((alreadyRegistered ?? []).map((row) => row.storage_path));
  const newUploads = uploads.filter(
    ({ bucket, objectPath }) =>
      !registeredPaths.has(buildProductImageStoragePath(bucket, objectPath))
  );

  if (newUploads.length === 0) {
    return { success: true, uploadedCount: uploads.length };
  }

  const { data: existing } = await supabase
    .from("product_images")
    .select("id, sort_order")
    .eq("product_id", productId);
  const hadImages = (existing ?? []).length > 0;
  const nextSortOrder =
    (existing ?? []).reduce((max, row) => Math.max(max, Number(row.sort_order ?? 0)), -1) + 1;

  const rows = newUploads.map(({ bucket, objectPath }, index) => ({
    product_id: productId,
    storage_path: buildProductImageStoragePath(bucket, objectPath),
    is_primary: !hadImages && index === 0,
    sort_order: nextSortOrder + index,
  }));
  const { error: insertError } = await supabase.from("product_images").insert(rows);

  if (insertError) {
    // The objects were uploaded but cannot be displayed without their metadata
    // rows, so remove only this failed batch to avoid orphaned Storage usage.
    for (const { bucket, objectPath } of newUploads) {
      await supabase.storage.from(bucket).remove([objectPath]);
    }
    return { success: false, error: insertError.message };
  }

  revalidatePath("/dashboard/products");
  revalidatePath(`/dashboard/products/${productId}`);
  revalidatePath(`/dashboard/products/${productId}/edit`);

  return { success: true, uploadedCount: uploads.length };
}
