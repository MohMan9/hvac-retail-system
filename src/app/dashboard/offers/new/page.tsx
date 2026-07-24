import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getServerDictionary } from "@/lib/i18n/get-server-locale";
import { getEffectivePermissions } from "@/lib/permissions.server";
import { getCurrentUser } from "@/lib/auth.server";
import { hasPermission } from "@/lib/permissions";
import { displayName } from "@/lib/display-name";
import { OfferForm } from "../offer-form";
import { createOffer } from "./actions";
import { mutedTextClass, pageTitleClass } from "@/lib/ui";

export default async function NewOfferPage() {
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

  const { data: products } = await supabase
    .from("products")
    .select("id, name_ar, name_en")
    .eq("organization_id", profile.organization_id)
    .eq("is_archived", false)
    .order("name_en");

  // All existing rules feed the client-side overlap check as the cashier types.
  const { data: existingRules } = await supabase
    .from("quantity_price_rules")
    .select("id, product_id, min_qty, max_qty")
    .eq("organization_id", profile.organization_id);

  return (
    <main className="mx-auto max-w-md px-8 py-6">
      <h1 className={`${pageTitleClass} mb-6`}>{dict["offers.newTitle"]}</h1>
      <OfferForm
        products={(products ?? []).map((product) => ({
          id: product.id,
          name: displayName(product.name_en, product.name_ar, locale),
        }))}
        existingRules={(existingRules ?? []).map((rule) => ({
          id: rule.id,
          product_id: rule.product_id,
          min_qty: Number(rule.min_qty),
          max_qty: Number(rule.max_qty),
        }))}
        submit={createOffer}
        submitLabelKey="offers.createButton"
      />
    </main>
  );
}
