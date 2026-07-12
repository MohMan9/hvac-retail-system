import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ProductEditForm } from "./product-edit-form";
import { getServerDictionary } from "@/lib/i18n/get-server-locale";
import { mutedTextClass, pageTitleClass } from "@/lib/ui";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function EditProductPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  const { dict } = await getServerDictionary();

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

  const isAdmin = profile.role === "admin";
  const canManage = profile.role === "manager" || profile.role === "admin";

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

  const { data: cost } = isAdmin
    ? await supabase
        .from("product_costs")
        .select("factory_price, shipping_cost, customs_cost")
        .eq("product_id", product.id)
        .maybeSingle()
    : { data: null };

  return (
    <main className="mx-auto max-w-2xl px-8 py-6">
      <h1 className={`${pageTitleClass} mb-6`}>{dict["productForm.editTitle"]}</h1>
      <ProductEditForm
        productId={product.id}
        isAdmin={isAdmin}
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
    </main>
  );
}
