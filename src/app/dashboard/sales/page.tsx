import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SaleForm } from "./SaleForm";
import { getServerDictionary } from "@/lib/i18n/get-server-locale";

export default async function SalesPage() {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  const { dict } = await getServerDictionary();

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
      />
    </main>
  );
}
