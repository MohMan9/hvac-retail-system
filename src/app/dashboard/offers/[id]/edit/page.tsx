import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getServerDictionary } from "@/lib/i18n/get-server-locale";
import { getEffectivePermissions } from "@/lib/permissions.server";
import { getCurrentUser } from "@/lib/auth.server";
import { hasPermission } from "@/lib/permissions";
import { displayName } from "@/lib/display-name";
import { OfferForm } from "../../offer-form";
import { updateOffer } from "./actions";
import { mutedTextClass, pageTitleClass } from "@/lib/ui";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function EditOfferPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createClient();
  const authData = await getCurrentUser();
  const { dict, locale } = await getServerDictionary();

  if (!authData.user) {
    redirect("/signin");
  }

  const permissions = await getEffectivePermissions();

  if (!hasPermission(permissions, "manage_products")) {
    return (
      <main className="mx-auto max-w-md px-8 py-6">
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
    redirect("/signin");
  }

  const { data: rule } = await supabase
    .from("quantity_price_rules")
    .select("id, product_id, min_qty, max_qty, price")
    .eq("id", id)
    .eq("organization_id", profile.organization_id)
    .single();

  if (!rule) {
    notFound();
  }

  const { data: products } = await supabase
    .from("products")
    .select("id, name_ar, name_en")
    .eq("organization_id", profile.organization_id)
    .eq("is_archived", false)
    .order("name_en");

  const { data: existingRules } = await supabase
    .from("quantity_price_rules")
    .select("id, product_id, min_qty, max_qty")
    .eq("organization_id", profile.organization_id);

  return (
    <main className="mx-auto max-w-md px-8 py-6">
      <h1 className={`${pageTitleClass} mb-6`}>{dict["offers.editTitle"]}</h1>
      <OfferForm
        products={(products ?? []).map((product) => ({
          id: product.id,
          name: displayName(product.name_en, product.name_ar, locale),
        }))}
        existingRules={(existingRules ?? []).map((existing) => ({
          id: existing.id,
          product_id: existing.product_id,
          min_qty: Number(existing.min_qty),
          max_qty: Number(existing.max_qty),
        }))}
        submit={updateOffer.bind(null, rule.id)}
        excludeRuleId={rule.id}
        initialValues={{
          productId: rule.product_id,
          minQty: String(Number(rule.min_qty)),
          maxQty: String(Number(rule.max_qty)),
          price: String(Number(rule.price)),
        }}
        submitLabelKey="offers.saveButton"
      />
    </main>
  );
}
