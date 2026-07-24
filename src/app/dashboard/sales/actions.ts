"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getServerLocale } from "@/lib/i18n/get-server-locale";
import { displayName } from "@/lib/display-name";
import { notifyDiscountRequested } from "@/lib/notifications";

type CustomerTier = "wholesale" | "craftsman" | "shop" | "retail";
type PaymentMethod = "cash" | "visa" | "cheque";

type PaymentInput = {
  method: PaymentMethod;
  amount: number;
  cheque_number: string | null;
  cheque_date: string | null;
};

type CartItemInput = {
  product_id: string;
  warehouse_id: string;
  quantity: number;
  unit_price: number;
  line_discount: number;
  discount_note: string | null;
  warranty_months: number | null;
  // Exact code scanned at sale time (null when the line was added without a
  // scan). For serialized products this is the customer's unique unit code,
  // which the product's shared barcode prefix cannot represent.
  scanned_barcode: string | null;
};

type ServiceInput = {
  service_id: string | null;
  description: string;
  price: number;
};

type SaveDraftInput = {
  customer_id: string;
  applied_tier: CustomerTier;
  payments: PaymentInput[];
  sale_date: string;
  note: string | null;
  items: CartItemInput[];
  services: ServiceInput[];
};

// A sale can be settled across several methods at once (e.g. part cash, part
// visa, part cheque). The method carrying the largest amount is stored on
// invoices.payment_method as the "primary" method for quick list-view display;
// the full breakdown lives in invoice_payments.
function primaryPaymentMethod(payments: PaymentInput[]): PaymentMethod {
  return payments.reduce((best, payment) => (payment.amount > best.amount ? payment : best)).method;
}

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

  // Every sale must be tied to a registered customer (invoices.customer_id is
  // NOT NULL). Walk-in sales are no longer allowed.
  if (!input.customer_id) {
    return { success: false, error: "A customer is required for every sale." };
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

  // Validate the payment breakdown. This mirrors the UI's live check and the DB
  // completion trigger: every line needs a positive amount, cheque lines need
  // their number/date, and the lines must sum to the invoice total (with the
  // same 0.01 rounding tolerance the trigger uses).
  if (input.payments.length === 0) {
    return { success: false, error: "Add at least one payment method." };
  }

  const invalidPayment = input.payments.find((payment) => !(payment.amount > 0));

  if (invalidPayment) {
    return { success: false, error: "Every payment line needs a positive amount." };
  }

  const invalidCheque = input.payments.find(
    (payment) =>
      payment.method === "cheque" && (!payment.cheque_number?.trim() || !payment.cheque_date)
  );

  if (invalidCheque) {
    return { success: false, error: "Enter a cheque number and date for every cheque payment." };
  }

  const paymentsTotal = money(input.payments.reduce((sum, payment) => sum + payment.amount, 0));

  if (Math.abs(paymentsTotal - total) > 0.01) {
    return { success: false, error: "Payments must add up to the invoice total." };
  }

  const { data: invoice, error: invoiceError } = await supabase
    .from("invoices")
    .insert({
      organization_id: profile.organization_id,
      customer_id: input.customer_id,
      applied_tier: input.applied_tier,
      payment_method: primaryPaymentMethod(input.payments),
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

  // Persist the full payment breakdown — one invoice_payments row per line.
  // The DB completion trigger later checks these sum to the invoice total.
  const { error: paymentsError } = await supabase.from("invoice_payments").insert(
    input.payments.map((payment) => ({
      invoice_id: invoice.id,
      payment_method: payment.method,
      amount: money(payment.amount),
      cheque_number: payment.method === "cheque" ? payment.cheque_number?.trim() || null : null,
      cheque_date: payment.method === "cheque" ? payment.cheque_date : null,
    }))
  );

  if (paymentsError) {
    return {
      success: false,
      error: `Invoice was created, but payment details failed to save (${paymentsError.message}).`,
    };
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
            scanned_barcode: item.scanned_barcode,
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
