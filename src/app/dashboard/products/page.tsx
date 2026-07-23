import Link from "next/link";
import Image from "next/image";
import { redirect } from "next/navigation";
import { Package, Search } from "lucide-react";
import { getCurrentUser } from "@/lib/auth.server";
import { createClient } from "@/lib/supabase/server";
import { parseProductImageStoragePath } from "@/lib/product-images";
import { Pagination } from "@/components/pagination";
import { Badge } from "@/components/ui/badge";
import { PAGE_SIZE, pageRange, parsePage, sanitizeSearchTerm } from "@/lib/pagination";
import { getServerDictionary } from "@/lib/i18n/get-server-locale";
import { getEffectivePermissions } from "@/lib/permissions.server";
import { hasPermission } from "@/lib/permissions";
import { displayName } from "@/lib/display-name";
import { marginPercent } from "@/lib/margin";
import { EmptyState } from "@/components/ui/empty-state";
import {
  btnPrimary,
  btnSecondary,
  inputClass,
  linkClass,
  pageTitleClass,
  tableWrapClass,
  tdClass,
  theadRowClass,
  thClass,
  trClass,
} from "@/lib/ui";

type ProductsPageProps = {
  searchParams: Promise<{ message?: string; q?: string; page?: string }>;
};

type ProductImage = {
  id: string;
  product_id: string;
  storage_path: string;
  is_primary: boolean | null;
  sort_order: number | null;
};

function pickProductImage(images: ProductImage[]) {
  return images.find((image) => image.is_primary) ?? images[0] ?? null;
}

// Small live-computed margin % shown under a price cell for view_product_costs
// users. Returns nothing when there's no price or no usable landed cost.
function MarginLine({
  price,
  landedCost,
}: {
  price: number | string | null | undefined;
  landedCost: number | undefined;
}) {
  if (price === null || price === undefined || landedCost === undefined) {
    return null;
  }
  const margin = marginPercent(Number(price), landedCost);
  if (margin === null) {
    return null;
  }
  return (
    <span
      className={`mt-0.5 block text-xs ${margin < 0 ? "text-red-500" : "text-slate-400"}`}
      dir="ltr"
    >
      {margin.toFixed(1)}%
    </span>
  );
}

const unitKeys: Record<string, "unit.piece" | "unit.meter"> = {
  piece: "unit.piece",
  meter: "unit.meter",
};

export default async function ProductsPage({ searchParams }: ProductsPageProps) {
  const { message, q: rawQ, page: pageParam } = await searchParams;
  const q = sanitizeSearchTerm(rawQ);
  const page = parsePage(pageParam);
  const { from, to } = pageRange(page);
  const { dict, locale } = await getServerDictionary();

  const supabase = await createClient();
  const authData = await getCurrentUser();

  if (!authData.user) {
    redirect("/signin");
  }

  // Three independent permissions used to sit behind one role check here:
  // editing products, and viewing the loaded-cost column, can now be granted
  // separately.
  const permissions = await getEffectivePermissions();
  const canManageProducts = hasPermission(permissions, "manage_products");
  const canViewLoadedCost = hasPermission(permissions, "view_loaded_cost");
  // Margin display is gated on view_product_costs (it needs the real cost);
  // this is separate from the loaded-cost column's view_loaded_cost gate.
  const canViewProductCosts = hasPermission(permissions, "view_product_costs");

  let productsQuery = supabase
    .from("products")
    .select("id, barcode, name_ar, name_en, serial_suffix_length, unit_of_measure", { count: "exact" })
    .order("name_en")
    .range(from, to);

  if (q) {
    productsQuery = productsQuery.or(
      `name_en.ilike.%${q}%,name_ar.ilike.%${q}%,barcode.ilike.%${q}%`
    );
  }

  const { data: products, count } = await productsQuery;
  const totalPages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));

  const productIds = (products ?? []).map((product) => product.id);

  // Only fetch prices for the products on this page — otherwise this pulls
  // every price row in the org for a 20-row page.
  const pricesPromise = productIds.length
    ? supabase
        .from("product_prices")
        .select("product_id, price_wholesale, price_craftsman, price_shop, price_retail")
        .in("product_id", productIds)
    : Promise.resolve({ data: [] });

  const productImagesPromise = productIds.length
    ? supabase
        .from("product_images")
        .select("id, product_id, storage_path, is_primary, sort_order")
        .in("product_id", productIds)
        .order("sort_order", { ascending: true })
    : Promise.resolve({ data: [] });

  const loadedCostsPromise = canViewLoadedCost && productIds.length
    ? supabase
        .from("v_product_loaded_cost")
        .select("product_id, loaded_cost")
        .in("product_id", productIds)
    : Promise.resolve({ data: [] });

  const productCostsPromise = canViewProductCosts && productIds.length
    ? supabase
        .from("product_costs")
        .select("product_id, factory_price, shipping_cost, customs_cost")
        .in("product_id", productIds)
    : Promise.resolve({ data: [] });

  const [
    { data: prices },
    { data: productImages },
    { data: loadedCosts },
    { data: productCosts },
  ] = await Promise.all([
    pricesPromise,
    productImagesPromise,
    loadedCostsPromise,
    productCostsPromise,
  ]);

  const priceByProduct = new Map((prices ?? []).map((p) => [p.product_id, p]));

  const imagesByProduct = new Map<string, ProductImage[]>();

  for (const image of (productImages ?? []) as ProductImage[]) {
    const images = imagesByProduct.get(image.product_id) ?? [];
    images.push(image);
    imagesByProduct.set(image.product_id, images);
  }

  const loadedCostByProduct = new Map<string, number>(
    (loadedCosts ?? []).map((cost) => [cost.product_id, cost.loaded_cost])
  );

  // Landed cost per product for the margin display — summed from product_costs,
  // whose RLS is gated by view_product_costs (the same permission this needs),
  // so it's readable exactly when margins should be shown.
  // product_costs.product_id is the table's primary key, so each product can
  // contribute at most one row and Map construction cannot overwrite a peer.
  const marginLandedCostByProduct = new Map(
    (productCosts ?? []).map((cost) => [
      cost.product_id,
      Number(cost.factory_price ?? 0) +
        Number(cost.shipping_cost ?? 0) +
        Number(cost.customs_cost ?? 0),
    ])
  );

  const isEmpty = !products || products.length === 0;

  return (
    <main className="mx-auto max-w-6xl px-8 py-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className={pageTitleClass}>{dict["products.title"]}</h1>
        {canManageProducts && (
          <Link href="/dashboard/products/new" className={btnPrimary}>
            {dict["products.newButton"]}
          </Link>
        )}
      </div>

      <form action="/dashboard/products" method="get" className="mb-4 flex gap-2">
        <div className="relative w-full max-w-sm">
          <Search className="pointer-events-none absolute inset-y-0 start-3 my-auto h-4 w-4 text-slate-400" />
          <input
            type="text"
            name="q"
            defaultValue={q}
            placeholder={dict["products.searchPlaceholder"]}
            className={`${inputClass} ps-9`}
          />
        </div>
        <button type="submit" className={btnSecondary}>
          {dict["common.search"]}
        </button>
      </form>

      {message && (
        <p className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {message}
        </p>
      )}

      {isEmpty ? (
        <EmptyState
          icon={Package}
          message={dict["products.notFound"]}
          actionLabel={canManageProducts ? dict["products.newButton"] : undefined}
          actionHref={canManageProducts ? "/dashboard/products/new" : undefined}
        />
      ) : (
        <div className={tableWrapClass}>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className={theadRowClass}>
                <th className={thClass}>{dict["products.colName"]}</th>
                <th className={thClass}>{dict["products.colBarcode"]}</th>
                <th className={thClass}>{dict["products.colUnit"]}</th>
                <th className={thClass}>{dict["products.colWholesale"]}</th>
                <th className={thClass}>{dict["products.colCraftsman"]}</th>
                <th className={thClass}>{dict["products.colShop"]}</th>
                <th className={thClass}>{dict["products.colRetail"]}</th>
                {canViewLoadedCost && <th className={thClass}>{dict["products.colLoadedCost"]}</th>}
                {canManageProducts && <th className={thClass}>{dict["products.colActions"]}</th>}
              </tr>
            </thead>
            <tbody>
              {products?.map((product) => {
                const price = priceByProduct.get(product.id);
                const productName = displayName(product.name_en, product.name_ar, locale);
                const image = pickProductImage(imagesByProduct.get(product.id) ?? []);
                const imageReference = image
                  ? parseProductImageStoragePath(image.storage_path)
                  : null;
                const imageUrl = imageReference
                  ? supabase.storage
                      .from(imageReference.bucket)
                      .getPublicUrl(imageReference.objectPath).data.publicUrl
                  : null;
                const unitKey = unitKeys[product.unit_of_measure];

                return (
                  <tr key={product.id} className={trClass}>
                    <td className={tdClass}>
                      <Link
                        href={`/dashboard/products/${product.id}`}
                        className="flex items-center gap-3 font-medium text-slate-900 hover:text-blue-600"
                      >
                        {imageUrl ? (
                          <Image
                            src={imageUrl}
                            alt={productName || "Product image"}
                            width={40}
                            height={40}
                            className="h-10 w-10 rounded-lg object-cover"
                          />
                        ) : (
                          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100">
                            <Package className="h-4 w-4 text-slate-400" />
                          </span>
                        )}
                        <span>{productName}</span>
                        {product.serial_suffix_length > 0 && (
                          <Badge tone="slate">
                            {dict["products.serialized"]} ±{product.serial_suffix_length}
                          </Badge>
                        )}
                      </Link>
                    </td>
                    <td className={tdClass} dir="ltr">
                      {product.barcode}
                    </td>
                    <td className={tdClass}>{unitKey ? dict[unitKey] : product.unit_of_measure}</td>
                    <td className={tdClass} dir="ltr">
                      {price?.price_wholesale ?? "—"}
                      {canViewProductCosts && (
                        <MarginLine
                          price={price?.price_wholesale}
                          landedCost={marginLandedCostByProduct.get(product.id)}
                        />
                      )}
                    </td>
                    <td className={tdClass} dir="ltr">
                      {price?.price_craftsman ?? "—"}
                      {canViewProductCosts && (
                        <MarginLine
                          price={price?.price_craftsman}
                          landedCost={marginLandedCostByProduct.get(product.id)}
                        />
                      )}
                    </td>
                    <td className={tdClass} dir="ltr">
                      {price?.price_shop ?? "—"}
                      {canViewProductCosts && (
                        <MarginLine
                          price={price?.price_shop}
                          landedCost={marginLandedCostByProduct.get(product.id)}
                        />
                      )}
                    </td>
                    <td className={tdClass} dir="ltr">
                      {price?.price_retail ?? "—"}
                      {canViewProductCosts && (
                        <MarginLine
                          price={price?.price_retail}
                          landedCost={marginLandedCostByProduct.get(product.id)}
                        />
                      )}
                    </td>
                    {canViewLoadedCost && (
                      <td className={tdClass} dir="ltr">
                        {loadedCostByProduct.get(product.id) ?? "—"}
                      </td>
                    )}
                    {canManageProducts && (
                      <td className={tdClass}>
                        <Link href={`/dashboard/products/${product.id}/edit`} className={linkClass}>
                          {dict["common.edit"]}
                        </Link>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Pagination
        basePath="/dashboard/products"
        params={{ q }}
        page={page}
        totalPages={totalPages}
        dict={dict}
      />
    </main>
  );
}
