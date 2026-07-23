import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth.server";
import { todayInShopTimezone } from "@/lib/date";
import { SaleForm } from "./SaleForm";

export default async function SalesPage() {
  const supabase = await createClient();
  const authData = await getCurrentUser();

  if (!authData.user) {
    redirect("/signin");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("organization_id")
    .eq("id", authData.user.id)
    .single();

  if (!profile) {
    redirect("/signin");
  }

  const { data: products } = await supabase
    .from("products")
    .select(
      "id, barcode, name_ar, name_en, warranty_months, product_prices(price_wholesale, price_craftsman, price_shop, price_retail)"
    )
    .eq("organization_id", profile.organization_id)
    .order("name_en");

  const { data: customers } = await supabase
    .from("customers")
    .select("id, name, phone, customer_type")
    .eq("organization_id", profile.organization_id)
    .order("name");

  const { data: warehouses } = await supabase
    .from("warehouses")
    .select("id, name_en")
    .eq("organization_id", profile.organization_id)
    .order("name_en");

  const { data: services } = await supabase
    .from("services")
    .select("id, name_ar, name_en, default_price")
    .eq("organization_id", profile.organization_id)
    .order("name_en");

  const { data: organization } = await supabase
    .from("organizations")
    .select("vat_rate")
    .eq("id", profile.organization_id)
    .single();

  const { data: inventory } = await supabase
    .from("inventory")
    .select("product_id, warehouse_id, quantity")
    .eq("organization_id", profile.organization_id);

  // Quantity-based pricing rules ("offers"): when a cart line's quantity falls
  // in a rule's range, its price overrides the customer-tier price.
  const { data: offerRules } = await supabase
    .from("quantity_price_rules")
    .select("id, product_id, min_qty, max_qty, price")
    .eq("organization_id", profile.organization_id);

  // Top sellers: total quantity sold per product across COMPLETED invoices in
  // the last 30 days, scoped to the org via the inner-joined invoices row.
  // PostgREST has no GROUP BY, so we pull the qualifying invoice_items and sum
  // per product in memory, then keep the 10 highest as a quick-add row.
  const cutoff = new Date(`${todayInShopTimezone()}T00:00:00Z`);
  cutoff.setUTCDate(cutoff.getUTCDate() - 30);
  const cutoffDate = cutoff.toISOString().slice(0, 10);

  const { data: recentSoldItems } = await supabase
    .from("invoice_items")
    .select("product_id, quantity, invoices!inner(organization_id, status, sale_date)")
    .eq("invoices.organization_id", profile.organization_id)
    .eq("invoices.status", "completed")
    .gte("invoices.sale_date", cutoffDate);

  const soldQtyByProduct = new Map<string, number>();
  for (const item of recentSoldItems ?? []) {
    soldQtyByProduct.set(
      item.product_id,
      (soldQtyByProduct.get(item.product_id) ?? 0) + Number(item.quantity ?? 0)
    );
  }

  const topSellerIds = [...soldQtyByProduct.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([productId]) => productId);

  const saleProducts =
    products?.map((product) => {
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
    }) ?? [];

  return (
    <main className="mx-auto max-w-7xl px-8 py-6">
      <SaleForm
        products={saleProducts}
        customers={customers ?? []}
        warehouses={warehouses ?? []}
        services={(services ?? []).map((service) => ({
          ...service,
          default_price: Number(service.default_price ?? 0),
        }))}
        vatRate={Number(organization?.vat_rate ?? 0)}
        stock={inventory ?? []}
        offerRules={(offerRules ?? []).map((rule) => ({
          id: rule.id,
          product_id: rule.product_id,
          min_qty: Number(rule.min_qty),
          max_qty: Number(rule.max_qty),
          price: Number(rule.price),
        }))}
        topSellerIds={topSellerIds}
      />
    </main>
  );
}
