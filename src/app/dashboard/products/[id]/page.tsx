import Link from "next/link";
import Image from "next/image";
import { notFound, redirect } from "next/navigation";
import { ImageOff } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { parseProductImageStoragePath } from "@/lib/product-images";
import { Badge } from "@/components/ui/badge";
import { getServerDictionary } from "@/lib/i18n/get-server-locale";
import { getEffectivePermissions } from "@/lib/permissions.server";
import { hasPermission } from "@/lib/permissions";
import { displayName } from "@/lib/display-name";
import {
  cardClass,
  linkClass,
  pageTitleClass,
  sectionTitleClass,
  tableWrapClass,
  tdClass,
  theadRowClass,
  thClass,
} from "@/lib/ui";

type PageProps = {
  params: Promise<{ id: string }>;
};

function formatMoney(value: number | string | null | undefined) {
  return value === null || value === undefined ? "—" : Number(value).toFixed(2);
}

const unitKeys: Record<string, "unit.piece" | "unit.meter"> = {
  piece: "unit.piece",
  meter: "unit.meter",
};

export default async function ProductDetailPage({ params }: PageProps) {
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
  const canManageProducts = hasPermission(permissions, "manage_products");
  const canViewLoadedCost = hasPermission(permissions, "view_loaded_cost");

  const { data: product } = await supabase
    .from("products")
    .select(
      "id, name_ar, name_en, description_ar, description_en, barcode, serial_suffix_length, unit_of_measure, warranty_months"
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

  const { data: images } = await supabase
    .from("product_images")
    .select("id, storage_path, is_primary, sort_order")
    .eq("product_id", product.id)
    .order("sort_order", { ascending: true });

  const { data: loadedCost } = canViewLoadedCost
    ? await supabase
        .from("v_product_loaded_cost")
        .select("loaded_cost")
        .eq("product_id", product.id)
        .single()
    : { data: null };

  const productName = displayName(product.name_en, product.name_ar, locale);
  const unitKey = unitKeys[product.unit_of_measure];

  return (
    <main className="mx-auto max-w-5xl px-8 py-6">
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className={pageTitleClass}>{productName}</h1>
          {product.serial_suffix_length > 0 && (
            <Badge tone="slate">
              {dict["products.serialized"]} ±{product.serial_suffix_length}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-4">
          {canManageProducts && (
            <Link href={`/dashboard/products/${product.id}/edit`} className={linkClass}>
              {dict["common.edit"]}
            </Link>
          )}
          <Link href="/dashboard/products" className={linkClass}>
            {dict["productDetail.backToProducts"]}
          </Link>
        </div>
      </div>

      <section className="mb-8">
        <h2 className={`${sectionTitleClass} mb-3`}>{dict["productDetail.imagesTitle"]}</h2>
        {images && images.length > 0 ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {images.map((image) => {
              const imageReference = parseProductImageStoragePath(image.storage_path);
              const publicUrl = supabase.storage
                .from(imageReference.bucket)
                .getPublicUrl(imageReference.objectPath).data.publicUrl;

              return (
                <div
                  key={image.id}
                  className="relative aspect-square w-full overflow-hidden rounded-lg border border-slate-200"
                >
                  <Image
                    src={publicUrl}
                    alt={productName || "Product image"}
                    fill
                    sizes="(max-width: 640px) 50vw, (max-width: 768px) 33vw, 25vw"
                    className="object-cover"
                  />
                </div>
              );
            })}
          </div>
        ) : (
          <div className="flex h-36 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 bg-white text-sm text-slate-400">
            <ImageOff className="h-6 w-6" strokeWidth={1.5} />
            {dict["productDetail.noImages"]}
          </div>
        )}
      </section>

      <section className={`grid gap-4 ${cardClass} p-4 text-sm md:grid-cols-2`}>
        <div>
          <span className="font-medium text-slate-700">{dict["productDetail.nameEn"]}: </span>
          <span className="text-slate-600">{product.name_en ?? "—"}</span>
        </div>
        <div>
          <span className="font-medium text-slate-700">{dict["productDetail.nameAr"]}: </span>
          <span className="text-slate-600">{product.name_ar ?? "—"}</span>
        </div>
        <div>
          <span className="font-medium text-slate-700">{dict["productDetail.descriptionEn"]}: </span>
          <span className="text-slate-600">{product.description_en ?? "—"}</span>
        </div>
        <div>
          <span className="font-medium text-slate-700">{dict["productDetail.descriptionAr"]}: </span>
          <span className="text-slate-600">{product.description_ar ?? "—"}</span>
        </div>
        <div>
          <span className="font-medium text-slate-700">{dict["productDetail.barcode"]}: </span>
          <span className="text-slate-600" dir="ltr">
            {product.barcode}
          </span>
        </div>
        <div>
          <span className="font-medium text-slate-700">{dict["productDetail.unit"]}: </span>
          <span className="text-slate-600">{unitKey ? dict[unitKey] : product.unit_of_measure}</span>
        </div>
        <div>
          <span className="font-medium text-slate-700">{dict["productDetail.warranty"]}: </span>
          <span className="text-slate-600">
            {product.warranty_months
              ? `${product.warranty_months} ${dict["productDetail.months"]}`
              : dict["productDetail.noWarranty"]}
          </span>
        </div>
      </section>

      <section className="mt-8">
        <h2 className={`${sectionTitleClass} mb-3`}>{dict["productDetail.pricingTitle"]}</h2>
        <div className={tableWrapClass}>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className={theadRowClass}>
                <th className={thClass}>{dict["products.colWholesale"]}</th>
                <th className={thClass}>{dict["products.colCraftsman"]}</th>
                <th className={thClass}>{dict["products.colShop"]}</th>
                <th className={thClass}>{dict["products.colRetail"]}</th>
                {canViewLoadedCost && <th className={thClass}>{dict["products.colLoadedCost"]}</th>}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className={tdClass} dir="ltr">
                  {formatMoney(price?.price_wholesale)}
                </td>
                <td className={tdClass} dir="ltr">
                  {formatMoney(price?.price_craftsman)}
                </td>
                <td className={tdClass} dir="ltr">
                  {formatMoney(price?.price_shop)}
                </td>
                <td className={tdClass} dir="ltr">
                  {formatMoney(price?.price_retail)}
                </td>
                {canViewLoadedCost && (
                  <td className={tdClass} dir="ltr">
                    {formatMoney(loadedCost?.loaded_cost)}
                  </td>
                )}
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
