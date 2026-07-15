"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getServerLocale } from "@/lib/i18n/get-server-locale";
import { displayName } from "@/lib/display-name";
import { notifyDiscountRequested } from "@/lib/notifications";

type CustomerTier = "wholesale" | "craftsman" | "shop" | "retail";
type PaymentMethod = "cash" | "visa";

type CartItemInput = {
  product_id: string;
  warehouse_id: string;
  quantity: number;
  unit_price: number;
  line_discount: number;
  discount_note: string | null;
  warranty_months: number | null;
};

type ServiceInput = {
  service_id: string | null;
  description: string;
  price: number;
};

type SaveDraftInput = {
  customer_id: string | null;
  applied_tier: CustomerTier;
  payment_method: PaymentMethod;
  sale_date: string;
  note: string | null;
  items: CartItemInput[];
  services: ServiceInput[];
};

type ActionResult = { success: false; error: string };

function money(value: number) {
  return Math.round(value * 100) / 100;
}

export async function saveDraftInvoice(input: SaveDraftInput): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();

  if (!authData.user) {
    return { success: false, error: "Not authenticated" };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("organization_id, full_name")
    .eq("id", authData.user.id)
    .single();

  if (!profile) {
    return { success: false, error: "No profile found for this account" };
  }

  if (input.items.length === 0 && input.services.length === 0) {
    return { success: false, error: "Add at least one product or service before saving." };
  }

  const invalidItem = input.items.find(
    (item) =>
      !item.product_id ||
      !item.warehouse_id ||
      item.quantity <= 0 ||
      item.unit_price < 0 ||
      item.line_discount < 0
  );

  if (invalidItem) {
    return {
      success: false,
      error: "Every product line needs a warehouse, positive quantity, and valid pricing.",
    };
  }

  const invalidService = input.services.find(
    (service) => !service.description.trim() || service.price < 0
  );

  if (invalidService) {
    return {
      success: false,
      error: "Every service line needs a description and a valid price.",
    };
  }

  const { data: organization } = await supabase
    .from("organizations")
    .select("vat_rate")
    .eq("id", profile.organization_id)
    .single();

  const grossItems = input.items.reduce(
    (sum, item) => sum + item.quantity * item.unit_price,
    0
  );
  const discountTotal = input.items.reduce((sum, item) => sum + item.line_discount, 0);
  const servicesTotal = input.services.reduce((sum, service) => sum + service.price, 0);
  const subtotal = money(grossItems + servicesTotal);
  const taxableSubtotal = Math.max(subtotal - discountTotal, 0);
  const vatAmount = money(taxableSubtotal * (Number(organization?.vat_rate ?? 0) / 100));
  const total = money(taxableSubtotal + vatAmount);

  const { data: invoice, error: invoiceError } = await supabase
    .from("invoices")
    .insert({
      organization_id: profile.organization_id,
      customer_id: input.customer_id,
      applied_tier: input.applied_tier,
      payment_method: input.payment_method,
      salesperson_id: authData.user.id,
      sale_date: input.sale_date,
      subtotal,
      discount_total: money(discountTotal),
      vat_amount: vatAmount,
      total,
      note: input.note,
      status: "draft",
    })
    .select("id, invoice_number")
    .single();

  if (invoiceError || !invoice) {
    return { success: false, error: invoiceError?.message ?? "Failed to create invoice" };
  }

  if (input.items.length > 0) {
    const { data: insertedItems, error: itemsError } = await supabase
      .from("invoice_items")
      .insert(
        input.items.map((item) => {
          const lineTotal = money(item.quantity * item.unit_price - item.line_discount);

          return {
            invoice_id: invoice.id,
            product_id: item.product_id,
            warehouse_id: item.warehouse_id,
            quantity: item.quantity,
            unit_price: item.unit_price,
            line_discount: item.line_discount,
            discount_note: item.discount_note,
            warranty_months: item.warranty_months,
            line_total: lineTotal,
          };
        })
      )
      .select("id, product_id, unit_price, line_discount, discount_note");

    if (itemsError) {
      return {
        success: false,
        error: `Invoice was created, but product lines failed to save (${itemsError.message}).`,
      };
    }

    const discountedItems = (insertedItems ?? []).filter(
      (item) => Number(item.line_discount ?? 0) > 0
    );

    if (discountedItems.length > 0) {
      const productIds = [...new Set(discountedItems.map((item) => item.product_id))];
      const { data: discountedProducts } = await supabase
        .from("products")
        .select("id, name_en, name_ar")
        .in("id", productIds);

      const locale = await getServerLocale();
      const productNameById = new Map(
        (discountedProducts ?? []).map((product) => [
          product.id,
          displayName(product.name_en, product.name_ar, locale),
        ])
      );

      for (const item of discountedItems) {
        await notifyDiscountRequested(supabase, {
          organizationId: profile.organization_id,
          invoiceId: invoice.id,
          invoiceItemId: item.id,
          invoiceNumber: invoice.invoice_number,
          productName: productNameById.get(item.product_id) ?? "Product",
          unitPrice: Number(item.unit_price ?? 0),
          lineDiscount: Number(item.line_discount ?? 0),
          discountNote: item.discount_note,
          requestedByName: profile.full_name ?? "Salesperson",
          requestedById: authData.user.id,
        });
      }
    }
  }

  if (input.services.length > 0) {
    const { error: servicesError } = await supabase.from("invoice_services").insert(
      input.services.map((service) => ({
        invoice_id: invoice.id,
        service_id: service.service_id,
        description: service.description,
        price: service.price,
      }))
    );

    if (servicesError) {
      return {
        success: false,
        error: `Invoice was created, but service lines failed to save (${servicesError.message}).`,
      };
    }
  }

  redirect(`/dashboard/invoices/${invoice.id}`);
}
