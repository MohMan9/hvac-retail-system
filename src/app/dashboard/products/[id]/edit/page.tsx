import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ProductEditForm } from "./product-edit-form";
import { ProductImagesManager } from "./product-images-manager";
import { ProductStockSection } from "./product-stock-section";
import { getServerDictionary } from "@/lib/i18n/get-server-locale";
import { getEffectivePermissions } from "@/lib/permissions.server";
import { hasPermission } from "@/lib/permissions";
import { parseProductImageStoragePath } from "@/lib/product-images";
import { displayName } from "@/lib/display-name";
import { todayInShopTimezone } from "@/lib/date";
import { mutedTextClass, pageTitleClass } from "@/lib/ui";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function EditProductPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  const { dict, locale } = await getServerDictionary();

  if (!authData.user) {
    redirect("/signin");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, organization_id")
    .eq("id", authData.user.id)
    .single();

  if (!profile) {
    redirect("/signin");
  }

  const permissions = await getEffectivePermissions();
  const canManage = hasPermission(permissions, "manage_products");
  const canViewCosts = hasPermission(permissions, "view_product_costs");
  // The Stock section reuses the same permission the "New Transfer" action
  // uses (manage_inventory_transfers).
  const canManageStock = hasPermission(permissions, "manage_inventory_transfers");

  if (!canManage) {
    return (
      <main className="mx-auto max-w-2xl px-8 py-6">
        <p className={mutedTextClass}>{dict["productForm.notAuthorized"]}</p>
      </main>
    );
  }

  const { data: product } = await supabase
    .from("products")
    .select(
      "id, name_ar, name_en, description_ar, description_en, barcode, unit_of_measure, warranty_months"
    )
    .eq("id", id)
    .eq("organization_id", profile.organization_id)
    .single();

  if (!product) {
    notFound();
  }

  const { data: price } = await supabase
    .from("product_prices")
    .select("price_wholesale, price_craftsman, price_shop, price_retail")
    .eq("product_id", product.id)
    .single();

  const { data: cost } = canViewCosts
    ? await supabase
        .from("product_costs")
        .select("factory_price, shipping_cost, customs_cost")
        .eq("product_id", product.id)
        .maybeSingle()
    : { data: null };

  // Images for the thumbnail grid — resolve each storage path to a public URL
  // here (the bucket is public), same as the product list/detail pages do.
  const { data: imageRows } = await supabase
    .from("product_images")
    .select("id, storage_path, is_primary, sort_order")
    .eq("product_id", product.id)
    .order("sort_order", { ascending: true });

  const images = (imageRows ?? []).map((row) => {
    const { bucket, objectPath } = parseProductImageStoragePath(row.storage_path);
    return {
      id: row.id,
      url: supabase.storage.from(bucket).getPublicUrl(objectPath).data.publicUrl,
      isPrimary: row.is_primary === true,
    };
  });

  // Stock section data (only needed when the user can manage transfers).
  let inventory: { warehouseName: string; quantity: number }[] = [];
  let warehouses: { id: string; name: string }[] = [];

  if (canManageStock) {
    const { data: inventoryRows } = await supabase
      .from("inventory")
      .select("quantity, warehouses(name_en, name_ar)")
      .eq("product_id", product.id);

    inventory = (inventoryRows ?? []).map((row) => {
      const warehouse = Array.isArray(row.warehouses) ? row.warehouses[0] : row.warehouses;
      return {
        warehouseName: displayName(warehouse?.name_en, warehouse?.name_ar, locale),
        quantity: Number(row.quantity ?? 0),
      };
    });

    const { data: warehouseRows } = await supabase
      .from("warehouses")
      .select("id, name_en, name_ar")
      .eq("organization_id", profile.organization_id)
      .order("name_en");

    warehouses = (warehouseRows ?? []).map((warehouse) => ({
      id: warehouse.id,
      name: displayName(warehouse.name_en, warehouse.name_ar, locale),
    }));
  }

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-8 py-6">
      <h1 className={pageTitleClass}>{dict["productForm.editTitle"]}</h1>
      <ProductEditForm
        productId={product.id}
        canViewCosts={canViewCosts}
        initialValues={{
          name_ar: product.name_ar,
          name_en: product.name_en,
          description_ar: product.description_ar,
          description_en: product.description_en,
          barcode: product.barcode,
          unit_of_measure: product.unit_of_measure,
          warranty_months: product.warranty_months,
          price_wholesale: price?.price_wholesale ?? null,
          price_craftsman: price?.price_craftsman ?? null,
          price_shop: price?.price_shop ?? null,
          price_retail: price?.price_retail ?? null,
          factory_price: cost?.factory_price ?? null,
          shipping_cost: cost?.shipping_cost ?? null,
          customs_cost: cost?.customs_cost ?? null,
        }}
      />

      <ProductImagesManager productId={product.id} images={images} />

      {canManageStock && (
        <ProductStockSection
          productId={product.id}
          today={todayInShopTimezone()}
          inventory={inventory}
          warehouses={warehouses}
        />
      )}
    </main>
  );
}
