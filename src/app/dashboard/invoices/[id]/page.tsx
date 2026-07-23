import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { InvoiceActions } from "./InvoiceActions";
import { DraftInvoiceItems } from "./DraftInvoiceItems";
import { DiscountBadge } from "./discount-badge";
import { getServerDictionary } from "@/lib/i18n/get-server-locale";
import { getEffectivePermissions } from "@/lib/permissions.server";
import { getCurrentUser } from "@/lib/auth.server";
import { hasPermission } from "@/lib/permissions";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import { displayName } from "@/lib/display-name";
import { StatusBadge } from "@/components/ui/badge";
import {
  btnPrimary,
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

function formatMoney(value: number | string | null) {
  return Number(value ?? 0).toFixed(2);
}

const statusKeys: Record<string, keyof Dictionary> = {
  draft: "status.draft",
  completed: "status.completed",
};

export default async function InvoiceDetailPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createClient();
  const authData = await getCurrentUser();
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

  const { data: invoice } = await supabase
    .from("invoices")
    .select(
      "id, invoice_number, customer_id, applied_tier, salesperson_id, sale_date, subtotal, discount_total, vat_amount, total, note, status, created_at"
    )
    .eq("id", id)
    .eq("organization_id", profile.organization_id)
    .single();

  if (!invoice) {
    notFound();
  }

  const { data: customer } = invoice.customer_id
    ? await supabase
        .from("customers")
        .select("id, name, phone")
        .eq("id", invoice.customer_id)
        .single()
    : { data: null };

  const { data: items } = await supabase
    .from("invoice_items")
    .select(
      "id, product_id, warehouse_id, quantity, unit_price, line_discount, discount_note, discount_approved_by, discount_rejected_by, warranty_start_date, warranty_months, line_total"
    )
    .eq("invoice_id", invoice.id)
    .order("id");

  const { data: invoiceServices } = await supabase
    .from("invoice_services")
    .select("id, service_id, description, price")
    .eq("invoice_id", invoice.id)
    .order("id");

  const productIds = [...new Set((items ?? []).map((item) => item.product_id))];
  const warehouseIds = [...new Set((items ?? []).map((item) => item.warehouse_id))];

  const { data: products } = productIds.length
    ? await supabase.from("products").select("id, name_ar, name_en").in("id", productIds)
    : { data: [] };

  const { data: warehouses } = warehouseIds.length
    ? await supabase.from("warehouses").select("id, name_en, name_ar").in("id", warehouseIds)
    : { data: [] };

  const productNameById = new Map(
    (products ?? []).map((product) => [product.id, displayName(product.name_en, product.name_ar, locale)])
  );
  const warehouseNameById = new Map(
    (warehouses ?? []).map((warehouse) => [
      warehouse.id,
      displayName(warehouse.name_en, warehouse.name_ar, locale),
    ])
  );
  // Approving/rejecting a discount is now gated by the granular permission.
  const canDecideDiscounts = hasPermission(permissions, "approve_reject_discounts");
  // Editing another salesperson's draft, on the other hand, stays a role-based
  // seniority concern — there's no granular permission for it, and role is
  // still meaningful as a seniority label.
  const isSenior = profile.role === "manager" || profile.role === "admin";
  const canEditItems =
    invoice.status === "draft" &&
    (isSenior || invoice.salesperson_id === authData.user.id);
  const statusKey = statusKeys[invoice.status];

  // Only draft invoices can have their lines edited, and only then do we
  // need the full catalog (for adding a new product line) and all
  // warehouses (for the warehouse picker) rather than just the ones already
  // referenced by this invoice's existing lines.
  const { data: allProducts } =
    invoice.status === "draft"
      ? await supabase
          .from("products")
          .select(
            "id, barcode, name_ar, name_en, warranty_months, product_prices(price_wholesale, price_craftsman, price_shop, price_retail)"
          )
          .eq("organization_id", profile.organization_id)
      : { data: [] };

  const { data: allWarehouses } =
    invoice.status === "draft"
      ? await supabase
          .from("warehouses")
          .select("id, name_en")
          .eq("organization_id", profile.organization_id)
          .order("name_en")
      : { data: [] };

  const draftProducts = (allProducts ?? []).map((product) => {
    const price = Array.isArray(product.product_prices)
      ? product.product_prices[0]
      : product.product_prices;

    return {
      id: product.id,
      barcode: product.barcode,
      name_ar: product.name_ar,
      name_en: product.name_en,
      warranty_months: product.warranty_months,
      price_wholesale: Number(price?.price_wholesale ?? 0),
      price_craftsman: Number(price?.price_craftsman ?? 0),
      price_shop: Number(price?.price_shop ?? 0),
      price_retail: Number(price?.price_retail ?? 0),
    };
  });

  return (
    <main className="mx-auto max-w-5xl px-8 py-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className={pageTitleClass}>
            {dict["invoices.colInvoice"]} {invoice.invoice_number}
          </h1>
          <p className="mt-1 flex items-center gap-2 text-sm text-slate-500">
            <span>{customer?.name ?? dict["invoices.walkIn"]}</span>
            <span>·</span>
            <span dir="ltr">{invoice.sale_date}</span>
            <span>·</span>
            <StatusBadge status={invoice.status} dict={dict} />
          </p>
        </div>
        <Link href="/dashboard/invoices" className={linkClass}>
          {dict["invoiceDetail.backToInvoices"]}
        </Link>
      </div>

      <section className={`mb-8 grid gap-3 ${cardClass} p-4 text-sm md:grid-cols-2`}>
        <div>
          <span className="font-medium text-slate-700">{dict["invoiceDetail.customer"]}: </span>
          <span className="text-slate-600">{customer?.name ?? dict["invoices.walkIn"]}</span>
        </div>
        <div>
          <span className="font-medium text-slate-700">{dict["invoiceDetail.tier"]}: </span>
          <span className="text-slate-600">{invoice.applied_tier}</span>
        </div>
        <div>
          <span className="font-medium text-slate-700">{dict["invoiceDetail.date"]}: </span>
          <span className="text-slate-600" dir="ltr">
            {invoice.sale_date}
          </span>
        </div>
        <div>
          <span className="font-medium text-slate-700">{dict["invoiceDetail.status"]}: </span>
          {statusKey ? <StatusBadge status={invoice.status} dict={dict} /> : invoice.status}
        </div>
      </section>

      <h2 className={`${sectionTitleClass} mb-3`}>{dict["invoiceDetail.productsTitle"]}</h2>
      {invoice.status === "draft" ? (
        <DraftInvoiceItems
          invoiceId={invoice.id}
          items={(items ?? []).map((item) => ({
            id: item.id,
            productId: item.product_id,
            productName: productNameById.get(item.product_id) ?? "",
            warehouseId: item.warehouse_id,
            warehouseName: warehouseNameById.get(item.warehouse_id) ?? null,
            quantity: Number(item.quantity ?? 0),
            unitPrice: Number(item.unit_price ?? 0),
            lineDiscount: Number(item.line_discount ?? 0),
            discountNote: item.discount_note,
            discountApprovedBy: item.discount_approved_by,
            discountRejectedBy: item.discount_rejected_by,
          }))}
          warehouses={allWarehouses ?? []}
          products={draftProducts}
          appliedTier={invoice.applied_tier}
          canEditItems={canEditItems}
          canDecideDiscounts={canDecideDiscounts}
        />
      ) : (
        <div className={`${tableWrapClass} mb-8`}>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className={theadRowClass}>
                <th className={thClass}>{dict["invoiceDetail.colProduct"]}</th>
                <th className={thClass}>{dict["invoiceDetail.colWarehouse"]}</th>
                <th className={thClass}>{dict["invoiceDetail.colQty"]}</th>
                <th className={thClass}>{dict["invoiceDetail.colUnitPrice"]}</th>
                <th className={thClass}>{dict["invoiceDetail.colDiscount"]}</th>
                <th className={thClass}>{dict["invoiceDetail.colLineTotal"]}</th>
              </tr>
            </thead>
            <tbody>
              {(items ?? []).map((item) => (
                <tr key={item.id} className="border-b border-slate-100 last:border-0">
                  <td className={tdClass}>{productNameById.get(item.product_id)}</td>
                  <td className={tdClass}>{warehouseNameById.get(item.warehouse_id)}</td>
                  <td className={tdClass} dir="ltr">
                    {item.quantity}
                  </td>
                  <td className={tdClass} dir="ltr">
                    {formatMoney(item.unit_price)}
                  </td>
                  <td className={tdClass} dir="ltr">
                    <div className="flex items-center justify-end gap-2">
                      {formatMoney(item.line_discount)}
                      {Number(item.line_discount ?? 0) > 0 && (
                        <DiscountBadge
                          approvedBy={item.discount_approved_by}
                          rejectedBy={item.discount_rejected_by}
                          t={(key) => dict[key]}
                        />
                      )}
                    </div>
                  </td>
                  <td className={tdClass} dir="ltr">
                    {formatMoney(item.line_total)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h2 className={`${sectionTitleClass} mb-3`}>{dict["invoiceDetail.servicesTitle"]}</h2>
      <div className={`${tableWrapClass} mb-8`}>
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className={theadRowClass}>
              <th className={thClass}>{dict["invoiceDetail.colDescription"]}</th>
              <th className={thClass}>{dict["invoiceDetail.colPrice"]}</th>
            </tr>
          </thead>
          <tbody>
            {(invoiceServices ?? []).map((service) => (
              <tr key={service.id} className="border-b border-slate-100 last:border-0">
                <td className={tdClass}>{service.description}</td>
                <td className={tdClass} dir="ltr">
                  {formatMoney(service.price)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <section className={`ms-auto flex max-w-xs flex-col gap-2 ${cardClass} p-4 text-sm`}>
        <div className="flex justify-between text-slate-600">
          <span>{dict["invoiceDetail.subtotal"]}</span>
          <span dir="ltr">{formatMoney(invoice.subtotal)}</span>
        </div>
        <div className="flex justify-between text-slate-600">
          <span>{dict["invoiceDetail.discount"]}</span>
          <span dir="ltr">{formatMoney(invoice.discount_total)}</span>
        </div>
        <div className="flex justify-between text-slate-600">
          <span>{dict["invoiceDetail.vat"]}</span>
          <span dir="ltr">{formatMoney(invoice.vat_amount)}</span>
        </div>
        <div className="flex justify-between border-t border-slate-200 pt-2 text-base font-semibold text-slate-900">
          <span>{dict["invoiceDetail.total"]}</span>
          <span dir="ltr" className="text-blue-600">
            {formatMoney(invoice.total)}
          </span>
        </div>
      </section>

      {invoice.status === "draft" ? (
        <InvoiceActions invoiceId={invoice.id} />
      ) : (
        <Link href={`/api/invoices/${invoice.id}/pdf`} className={`${btnPrimary} mt-6`}>
          {dict["invoiceDetail.downloadPdf"]}
        </Link>
      )}
    </main>
  );
}
