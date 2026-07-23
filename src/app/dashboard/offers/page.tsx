import Link from "next/link";
import { Tag } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getServerDictionary } from "@/lib/i18n/get-server-locale";
import { getEffectivePermissions } from "@/lib/permissions.server";
import { getCurrentUser } from "@/lib/auth.server";
import { hasPermission } from "@/lib/permissions";
import { displayName } from "@/lib/display-name";
import { EmptyState } from "@/components/ui/empty-state";
import { DeleteOfferButton } from "./delete-offer-button";
import {
  btnPrimary,
  linkClass,
  mutedTextClass,
  pageTitleClass,
  tableWrapClass,
  tdClass,
  theadRowClass,
  thClass,
  trClass,
} from "@/lib/ui";

function formatMoney(value: number | string | null) {
  return Number(value ?? 0).toFixed(2);
}

type ProductJoin = { name_ar: string | null; name_en: string | null };

export default async function OffersPage() {
  const supabase = await createClient();
  const authData = await getCurrentUser();
  const { dict, locale } = await getServerDictionary();

  const permissions = await getEffectivePermissions();
  const canManage = hasPermission(permissions, "manage_products");

  if (!authData.user || !canManage) {
    return (
      <main className="mx-auto max-w-2xl px-8 py-6">
        <p className={mutedTextClass}>{dict["offers.notAuthorized"]}</p>
      </main>
    );
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("organization_id")
    .eq("id", authData.user.id)
    .single();

  if (!profile) {
    return (
      <main className="mx-auto max-w-2xl px-8 py-6">
        <p className={mutedTextClass}>{dict["offers.notAuthorized"]}</p>
      </main>
    );
  }

  const { data: rules } = await supabase
    .from("quantity_price_rules")
    .select("id, product_id, min_qty, max_qty, price, products(name_ar, name_en)")
    .eq("organization_id", profile.organization_id)
    .order("min_qty");

  const offers = (rules ?? []).map((rule) => {
    const product = (
      Array.isArray(rule.products) ? rule.products[0] : rule.products
    ) as ProductJoin | null;

    return {
      id: rule.id,
      productName: displayName(product?.name_en ?? null, product?.name_ar ?? null, locale),
      minQty: Number(rule.min_qty),
      maxQty: Number(rule.max_qty),
      price: Number(rule.price),
    };
  });

  // Group visually by product by sorting on product name, then quantity range.
  offers.sort((a, b) => a.productName.localeCompare(b.productName) || a.minQty - b.minQty);

  return (
    <main className="mx-auto max-w-4xl px-8 py-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className={pageTitleClass}>{dict["offers.title"]}</h1>
        <Link href="/dashboard/offers/new" className={btnPrimary}>
          {dict["offers.newButton"]}
        </Link>
      </div>

      {offers.length > 0 ? (
        <div className={tableWrapClass}>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className={theadRowClass}>
                <th className={thClass}>{dict["offers.colProduct"]}</th>
                <th className={thClass}>{dict["offers.colMinQty"]}</th>
                <th className={thClass}>{dict["offers.colMaxQty"]}</th>
                <th className={thClass}>{dict["offers.colPrice"]}</th>
                <th className={thClass}>{dict["offers.colActions"]}</th>
              </tr>
            </thead>
            <tbody>
              {offers.map((offer) => (
                <tr key={offer.id} className={trClass}>
                  <td className={tdClass}>{offer.productName}</td>
                  <td className={tdClass} dir="ltr">
                    {offer.minQty}
                  </td>
                  <td className={tdClass} dir="ltr">
                    {offer.maxQty}
                  </td>
                  <td className={tdClass} dir="ltr">
                    {formatMoney(offer.price)}
                  </td>
                  <td className={tdClass}>
                    <div className="flex items-center gap-3">
                      <Link href={`/dashboard/offers/${offer.id}/edit`} className={linkClass}>
                        {dict["offers.edit"]}
                      </Link>
                      <DeleteOfferButton ruleId={offer.id} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState
          icon={Tag}
          message={dict["offers.notFound"]}
          actionLabel={dict["offers.newButton"]}
          actionHref="/dashboard/offers/new"
        />
      )}
    </main>
  );
}
