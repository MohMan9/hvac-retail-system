import type { createClient } from "@/lib/supabase/server";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

type DiscountRequestParams = {
  organizationId: string;
  invoiceId: string;
  invoiceItemId: string;
  invoiceNumber: string;
  productName: string;
  unitPrice: number;
  lineDiscount: number;
  discountNote: string | null;
  requestedByName: string;
};

// Notifies every manager/admin in the org that a discount line needs a
// decision. Called both when a new invoice is first saved with discounted
// lines (Task 1) and when an existing draft line's discount is edited after
// a prior rejection (Task 4), so it's centralized here for reuse.
export async function notifyDiscountRequested(
  supabase: SupabaseServerClient,
  params: DiscountRequestParams
) {
  const { data: approvers } = await supabase
    .from("profiles")
    .select("id")
    .eq("organization_id", params.organizationId)
    .in("role", ["manager", "admin"]);

  if (!approvers || approvers.length === 0) {
    return;
  }

  const data = {
    product_name: params.productName,
    unit_price: params.unitPrice,
    line_discount: params.lineDiscount,
    discount_note: params.discountNote,
    requested_by_name: params.requestedByName,
    invoice_number: params.invoiceNumber,
  };

  await supabase.from("notifications").insert(
    approvers.map((approver) => ({
      organization_id: params.organizationId,
      recipient_id: approver.id,
      type: "discount_request",
      invoice_id: params.invoiceId,
      invoice_item_id: params.invoiceItemId,
      data,
    }))
  );
}

type DiscountDecisionParams = {
  organizationId: string;
  recipientId: string;
  invoiceId: string;
  invoiceItemId: string;
  invoiceNumber: string;
  productName: string;
  unitPrice: number;
  lineDiscount: number;
  decidedByName: string;
  decision: "discount_approved" | "discount_rejected";
};

// Notifies the invoice's salesperson that a manager/admin decided on their
// discount request (Task 2).
export async function notifyDiscountDecision(
  supabase: SupabaseServerClient,
  params: DiscountDecisionParams
) {
  await supabase.from("notifications").insert({
    organization_id: params.organizationId,
    recipient_id: params.recipientId,
    type: params.decision,
    invoice_id: params.invoiceId,
    invoice_item_id: params.invoiceItemId,
    data: {
      product_name: params.productName,
      unit_price: params.unitPrice,
      line_discount: params.lineDiscount,
      decided_by_name: params.decidedByName,
      invoice_number: params.invoiceNumber,
    },
  });
}
