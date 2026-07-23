"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getServerLocale } from "@/lib/i18n/get-server-locale";
import { checkPermission } from "@/lib/permissions.server";
import { displayName } from "@/lib/display-name";
import { notifyDiscountDecision, notifyDiscountRequested } from "@/lib/notifications";

type ActionResult = { success: true } | { success: false; error: string };

type CompleteInvoiceResult =
  | { success: true; cashRegisterClosed: boolean }
  | { success: false; error: string };

function money(value: number) {
  return Math.round(value * 100) / 100;
}

async function getCaller() {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();

  if (!authData.user) {
    return { supabase, userId: null, profile: null };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, organization_id, full_name")
    .eq("id", authData.user.id)
    .single();

  return { supabase, userId: authData.user.id, profile };
}

// Shared lookup for the approve/reject actions: loads the invoice item plus
// its parent invoice (scoped to the caller's organization) and the
// product name, so both actions can build the same notification data shape.
async function getDiscountLineContext(
  supabase: Awaited<ReturnType<typeof createClient>>,
  invoiceItemId: string,
  organizationId: string
) {
  const { data: item } = await supabase
    .from("invoice_items")
    .select(
      "id, invoice_id, product_id, unit_price, line_discount, discount_note, discount_approved_by, discount_rejected_by"
    )
    .eq("id", invoiceItemId)
    .single();

  if (!item) {
    return null;
  }

  const { data: invoice } = await supabase
    .from("invoices")
    .select("id, invoice_number, salesperson_id, organization_id")
    .eq("id", item.invoice_id)
    .eq("organization_id", organizationId)
    .single();

  if (!invoice) {
    return null;
  }

  const { data: product } = await supabase
    .from("products")
    .select("name_en, name_ar")
    .eq("id", item.product_id)
    .single();

  const locale = await getServerLocale();

  return {
    item,
    invoice,
    productName: displayName(product?.name_en, product?.name_ar, locale) || "Product",
  };
}

export async function approveDiscount(invoiceItemId: string): Promise<ActionResult> {
  const { supabase, userId, profile } = await getCaller();

  if (!userId || !profile) {
    return { success: false, error: "Not authenticated" };
  }

  if (!(await checkPermission("approve_reject_discounts"))) {
    return { success: false, error: "You don't have permission to approve or reject discounts" };
  }

  const context = await getDiscountLineContext(supabase, invoiceItemId, profile.organization_id);

  if (!context) {
    return { success: false, error: "Invoice item not found" };
  }

  const { error } = await supabase
    .from("invoice_items")
    .update({ discount_approved_by: userId })
    .eq("id", invoiceItemId);

  if (error) {
    return { success: false, error: error.message };
  }

  if (context.invoice.salesperson_id) {
    await notifyDiscountDecision(supabase, {
      organizationId: profile.organization_id,
      recipientId: context.invoice.salesperson_id,
      invoiceId: context.invoice.id,
      invoiceItemId,
      invoiceNumber: context.invoice.invoice_number,
      productName: context.productName,
      unitPrice: Number(context.item.unit_price ?? 0),
      lineDiscount: Number(context.item.line_discount ?? 0),
      decidedByName: profile.full_name ?? "Manager",
      decision: "discount_approved",
    });
  }

  revalidatePath(`/dashboard/invoices/${context.invoice.id}`);
  return { success: true };
}

export async function rejectDiscount(invoiceItemId: string): Promise<ActionResult> {
  const { supabase, userId, profile } = await getCaller();

  if (!userId || !profile) {
    return { success: false, error: "Not authenticated" };
  }

  if (!(await checkPermission("approve_reject_discounts"))) {
    return { success: false, error: "You don't have permission to approve or reject discounts" };
  }

  const context = await getDiscountLineContext(supabase, invoiceItemId, profile.organization_id);

  if (!context) {
    return { success: false, error: "Invoice item not found" };
  }

  const { error } = await supabase
    .from("invoice_items")
    .update({ discount_rejected_by: userId, discount_rejected_at: new Date().toISOString() })
    .eq("id", invoiceItemId);

  if (error) {
    return { success: false, error: error.message };
  }

  if (context.invoice.salesperson_id) {
    await notifyDiscountDecision(supabase, {
      organizationId: profile.organization_id,
      recipientId: context.invoice.salesperson_id,
      invoiceId: context.invoice.id,
      invoiceItemId,
      invoiceNumber: context.invoice.invoice_number,
      productName: context.productName,
      unitPrice: Number(context.item.unit_price ?? 0),
      lineDiscount: Number(context.item.line_discount ?? 0),
      decidedByName: profile.full_name ?? "Manager",
      decision: "discount_rejected",
    });
  }

  revalidatePath(`/dashboard/invoices/${context.invoice.id}`);
  return { success: true };
}

export async function completeInvoice(invoiceId: string): Promise<CompleteInvoiceResult> {
  const { supabase, userId, profile } = await getCaller();

  if (!userId || !profile) {
    return { success: false, error: "Not authenticated" };
  }

  // Same ownership rule as editing: only the invoice's own salesperson or a
  // manager/admin may complete it. loadEditableInvoice also enforces the
  // draft-only precondition and org scoping.
  const loaded = await loadEditableInvoice(
    supabase,
    invoiceId,
    profile.organization_id,
    userId,
    profile.role
  );

  if ("error" in loaded) {
    return { success: false, error: loaded.error };
  }

  // Constrain the UPDATE itself to draft rows (not just the pre-check above):
  // if two completion attempts race, only the one that flips draft→completed
  // affects a row; the loser updates zero rows and we surface that.
  const { data: updated, error } = await supabase
    .from("invoices")
    .update({ status: "completed" })
    .eq("id", invoiceId)
    .eq("organization_id", profile.organization_id)
    .eq("status", "draft")
    .select("id, payment_method");

  if (error) {
    return { success: false, error: error.message };
  }

  if (!updated || updated.length === 0) {
    return { success: false, error: "This invoice has already been completed." };
  }

  // If this sale includes ANY cash portion but no register session is open,
  // that cash won't be captured by any register closing. Check invoice_payments
  // (not just the primary payment_method) so a split sale whose largest method
  // isn't cash still triggers the warning. Don't block the sale — just flag it
  // so the UI can warn instead of the gap being silent.
  let cashRegisterClosed = false;

  const { data: cashPayment } = await supabase
    .from("invoice_payments")
    .select("id")
    .eq("invoice_id", invoiceId)
    .eq("payment_method", "cash")
    .limit(1)
    .maybeSingle();

  if (cashPayment) {
    const { data: openSession } = await supabase
      .from("cash_sessions")
      .select("id")
      .eq("organization_id", profile.organization_id)
      .is("closed_at", null)
      .maybeSingle();

    cashRegisterClosed = !openSession;
  }

  revalidatePath(`/dashboard/invoices/${invoiceId}`);
  revalidatePath("/dashboard/invoices");
  return { success: true, cashRegisterClosed };
}

// Recomputes subtotal/discount_total/vat_amount/total from the invoice's
// actual current rows (items + services) rather than trusting client-sent
// numbers — called after every edit/add/remove of a draft invoice's lines.
async function recalculateInvoiceTotals(
  supabase: Awaited<ReturnType<typeof createClient>>,
  invoiceId: string,
  organizationId: string
): Promise<ActionResult> {
  const { data: items } = await supabase
    .from("invoice_items")
    .select("quantity, unit_price, line_discount")
    .eq("invoice_id", invoiceId);

  const { data: services } = await supabase
    .from("invoice_services")
    .select("price")
    .eq("invoice_id", invoiceId);

  const { data: organization } = await supabase
    .from("organizations")
    .select("vat_rate")
    .eq("id", organizationId)
    .single();

  const grossItems = (items ?? []).reduce(
    (sum, item) => sum + Number(item.quantity ?? 0) * Number(item.unit_price ?? 0),
    0
  );
  const discountTotal = (items ?? []).reduce((sum, item) => sum + Number(item.line_discount ?? 0), 0);
  const servicesTotal = (services ?? []).reduce((sum, service) => sum + Number(service.price ?? 0), 0);
  const subtotal = money(grossItems + servicesTotal);
  const taxableSubtotal = Math.max(subtotal - discountTotal, 0);
  const vatAmount = money(taxableSubtotal * (Number(organization?.vat_rate ?? 0) / 100));
  const total = money(taxableSubtotal + vatAmount);

  const { error } = await supabase
    .from("invoices")
    .update({
      subtotal,
      discount_total: money(discountTotal),
      vat_amount: vatAmount,
      total,
    })
    .eq("id", invoiceId);

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true };
}

type EditableInvoice = {
  id: string;
  invoice_number: string;
  organization_id: string;
  salesperson_id: string | null;
  status: string;
};

async function loadEditableInvoice(
  supabase: Awaited<ReturnType<typeof createClient>>,
  invoiceId: string,
  organizationId: string,
  userId: string,
  role: string
): Promise<{ error: string } | { invoice: EditableInvoice }> {
  const { data: invoice } = await supabase
    .from("invoices")
    .select("id, invoice_number, organization_id, salesperson_id, status")
    .eq("id", invoiceId)
    .eq("organization_id", organizationId)
    .single();

  if (!invoice) {
    return { error: "Invoice not found" };
  }

  if (invoice.status !== "draft") {
    return { error: "Only draft invoices can be edited" };
  }

  const canEdit = role === "manager" || role === "admin" || invoice.salesperson_id === userId;

  if (!canEdit) {
    return { error: "You don't have permission to edit this invoice" };
  }

  return { invoice };
}

type LineInput = {
  quantity: number;
  unit_price: number;
  line_discount: number;
  discount_note: string | null;
};

export async function updateInvoiceItem(
  invoiceItemId: string,
  input: LineInput
): Promise<ActionResult> {
  const { supabase, userId, profile } = await getCaller();

  if (!userId || !profile) {
    return { success: false, error: "Not authenticated" };
  }

  if (input.quantity <= 0 || input.unit_price < 0 || input.line_discount < 0) {
    return { success: false, error: "Enter a positive quantity and valid pricing." };
  }

  const { data: item } = await supabase
    .from("invoice_items")
    .select("id, invoice_id, product_id, line_discount, discount_rejected_by, discount_approved_by")
    .eq("id", invoiceItemId)
    .single();

  if (!item) {
    return { success: false, error: "Invoice item not found" };
  }

  const loaded = await loadEditableInvoice(
    supabase,
    item.invoice_id,
    profile.organization_id,
    userId,
    profile.role
  );

  if ("error" in loaded) {
    return { success: false, error: loaded.error };
  }

  const wasRejected = Boolean(item.discount_rejected_by);
  const discountChanged = Number(item.line_discount ?? 0) !== input.line_discount;
  const shouldResetRejection = wasRejected && discountChanged;
  const lineTotal = money(input.quantity * input.unit_price - input.line_discount);

  const { error } = await supabase
    .from("invoice_items")
    .update({
      quantity: input.quantity,
      unit_price: input.unit_price,
      line_discount: input.line_discount,
      discount_note: input.discount_note,
      line_total: lineTotal,
      ...(shouldResetRejection ? { discount_rejected_by: null, discount_rejected_at: null } : {}),
    })
    .eq("id", invoiceItemId);

  if (error) {
    return { success: false, error: error.message };
  }

  const totalsResult = await recalculateInvoiceTotals(
    supabase,
    loaded.invoice.id,
    profile.organization_id
  );

  if (!totalsResult.success) {
    return totalsResult;
  }

  // Whenever this edit leaves the line with a positive, still-unapproved
  // discount, it needs a fresh round of manager/admin approval. The DB
  // auto-resets a prior approve/reject decision on any discount change, so a
  // changed discount is unapproved by definition; we also re-notify if the
  // line was already sitting unapproved. Guard on `discountChanged` so a
  // pure quantity/price edit of an already-pending line doesn't spam.
  const wasApproved = Boolean(item.discount_approved_by);
  const leavesUnapprovedDiscount = input.line_discount > 0 && (discountChanged || !wasApproved);

  if (discountChanged && leavesUnapprovedDiscount) {
    const { data: product } = await supabase
      .from("products")
      .select("name_en, name_ar")
      .eq("id", item.product_id)
      .single();

    const locale = await getServerLocale();

    await notifyDiscountRequested(supabase, {
      organizationId: profile.organization_id,
      invoiceId: loaded.invoice.id,
      invoiceItemId,
      invoiceNumber: loaded.invoice.invoice_number,
      productName: displayName(product?.name_en, product?.name_ar, locale) || "Product",
      unitPrice: input.unit_price,
      lineDiscount: input.line_discount,
      discountNote: input.discount_note,
      requestedByName: profile.full_name ?? "Salesperson",
      requestedById: userId,
    });
  }

  revalidatePath(`/dashboard/invoices/${loaded.invoice.id}`);
  return { success: true };
}

export async function removeInvoiceItem(invoiceItemId: string): Promise<ActionResult> {
  const { supabase, userId, profile } = await getCaller();

  if (!userId || !profile) {
    return { success: false, error: "Not authenticated" };
  }

  const { data: item } = await supabase
    .from("invoice_items")
    .select("id, invoice_id")
    .eq("id", invoiceItemId)
    .single();

  if (!item) {
    return { success: false, error: "Invoice item not found" };
  }

  const loaded = await loadEditableInvoice(
    supabase,
    item.invoice_id,
    profile.organization_id,
    userId,
    profile.role
  );

  if ("error" in loaded) {
    return { success: false, error: loaded.error };
  }

  const { error } = await supabase.from("invoice_items").delete().eq("id", invoiceItemId);

  if (error) {
    return { success: false, error: error.message };
  }

  const totalsResult = await recalculateInvoiceTotals(
    supabase,
    loaded.invoice.id,
    profile.organization_id
  );

  if (!totalsResult.success) {
    return totalsResult;
  }

  revalidatePath(`/dashboard/invoices/${loaded.invoice.id}`);
  return { success: true };
}

type AddInvoiceItemInput = LineInput & {
  product_id: string;
  warehouse_id: string;
  warranty_months: number | null;
};

export async function addInvoiceItem(
  invoiceId: string,
  input: AddInvoiceItemInput
): Promise<ActionResult> {
  const { supabase, userId, profile } = await getCaller();

  if (!userId || !profile) {
    return { success: false, error: "Not authenticated" };
  }

  if (
    !input.product_id ||
    !input.warehouse_id ||
    input.quantity <= 0 ||
    input.unit_price < 0 ||
    input.line_discount < 0
  ) {
    return {
      success: false,
      error: "Choose a product and warehouse, and enter a positive quantity and valid pricing.",
    };
  }

  const loaded = await loadEditableInvoice(
    supabase,
    invoiceId,
    profile.organization_id,
    userId,
    profile.role
  );

  if ("error" in loaded) {
    return { success: false, error: loaded.error };
  }

  const lineTotal = money(input.quantity * input.unit_price - input.line_discount);

  const { data: newItem, error } = await supabase
    .from("invoice_items")
    .insert({
      invoice_id: invoiceId,
      product_id: input.product_id,
      warehouse_id: input.warehouse_id,
      quantity: input.quantity,
      unit_price: input.unit_price,
      line_discount: input.line_discount,
      discount_note: input.discount_note,
      warranty_months: input.warranty_months,
      line_total: lineTotal,
    })
    .select("id")
    .single();

  if (error || !newItem) {
    return { success: false, error: error?.message ?? "Failed to add product line" };
  }

  const totalsResult = await recalculateInvoiceTotals(supabase, invoiceId, profile.organization_id);

  if (!totalsResult.success) {
    return totalsResult;
  }

  if (input.line_discount > 0) {
    const { data: product } = await supabase
      .from("products")
      .select("name_en, name_ar")
      .eq("id", input.product_id)
      .single();

    const locale = await getServerLocale();

    await notifyDiscountRequested(supabase, {
      organizationId: profile.organization_id,
      invoiceId,
      invoiceItemId: newItem.id,
      invoiceNumber: loaded.invoice.invoice_number,
      productName: displayName(product?.name_en, product?.name_ar, locale) || "Product",
      unitPrice: input.unit_price,
      lineDiscount: input.line_discount,
      discountNote: input.discount_note,
      requestedByName: profile.full_name ?? "Salesperson",
      requestedById: userId,
    });
  }

  revalidatePath(`/dashboard/invoices/${invoiceId}`);
  return { success: true };
}
