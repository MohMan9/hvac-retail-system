import Link from "next/link";
import Image from "next/image";
import { redirect } from "next/navigation";
import { Package, Search } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { parseProductImageStoragePath } from "@/lib/product-images";
import { Pagination } from "@/components/pagination";
import { Badge } from "@/components/ui/badge";
import { PAGE_SIZE, pageRange, parsePage, sanitizeSearchTerm } from "@/lib/pagination";
import { getServerDictionary } from "@/lib/i18n/get-server-locale";
import { getEffectivePermissions } from "@/lib/permissions.server";
import { hasPermission } from "@/lib/permissions";
import { displayName } from "@/lib/display-name";
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
  const { data: authData } = await supabase.auth.getUser();

  if (!authData.user) {
    redirect("/signin");
  }

  // Three independent permissions used to sit behind one role check here:
  // editing products, and viewing the loaded-cost column, can now be granted
  // separately.
  const permissions = await getEffectivePermissions();
  const canManageProducts = hasPermission(permissions, "manage_products");
  const canViewLoadedCost = hasPermission(permissions, "view_loaded_cost");

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
  const { data: prices } = productIds.length
    ? await supabase
        .from("product_prices")
        .select("product_id, price_wholesale, price_craftsman, price_shop, price_retail")
        .in("product_id", productIds)
    : { data: [] };

  const priceByProduct = new Map((prices ?? []).map((p) => [p.product_id, p]));

  const { data: productImages } = productIds.length
    ? await supabase
        .from("product_images")
        .select("id, product_id, storage_path, is_primary, sort_order")
        .in("product_id", productIds)
        .order("sort_order", { ascending: true })
    : { data: [] };

  const imagesByProduct = new Map<string, ProductImage[]>();

  for (const image of (productImages ?? []) as ProductImage[]) {
    const images = imagesByProduct.get(image.product_id) ?? [];
    images.push(image);
    imagesByProduct.set(image.product_id, images);
  }

  let loadedCostByProduct = new Map<string, number>();

  if (canViewLoadedCost) {
    const { data: costs } = await supabase
      .from("v_product_loaded_cost")
      .select("product_id, loaded_cost");

    loadedCostByProduct = new Map(
      (costs ?? []).map((c) => [c.product_id, c.loaded_cost])
    );
  }

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
                    </td>
                    <td className={tdClass} dir="ltr">
                      {price?.price_craftsman ?? "—"}
                    </td>
                    <td className={tdClass} dir="ltr">
                      {price?.price_shop ?? "—"}
                    </td>
                    <td className={tdClass} dir="ltr">
                      {price?.price_retail ?? "—"}
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
