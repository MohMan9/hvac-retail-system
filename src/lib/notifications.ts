import type { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

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
  requestedById: string;
};

// Notifies everyone in the org who can actually decide discounts that a line
// needs a decision. Targeting is now by the approve_reject_discounts PERMISSION
// (not by role): a salesperson granted it should be notified, and a manager who
// had it revoked should not. The lookup uses the admin client because the
// requester (often a salesperson) can't read other users' user_permissions
// under RLS — this is a read-only "who should I notify" query.
export async function notifyDiscountRequested(
  supabase: SupabaseServerClient,
  params: DiscountRequestParams
) {
  const adminClient = createAdminClient();

  // Two-step (rather than a PostgREST embed) so we don't depend on a detectable
  // FK from user_permissions to profiles: first the users who hold the
  // permission, then narrow to active users in the same org.
  const { data: permissionRows } = await adminClient
    .from("user_permissions")
    .select("user_id")
    .eq("permission_key", "approve_reject_discounts")
    .eq("granted", true)
    // Don't notify the requester themselves (someone with the permission can
    // request a discount on their own sale).
    .neq("user_id", params.requestedById);

  const candidateIds = [...new Set((permissionRows ?? []).map((row) => row.user_id))];

  if (candidateIds.length === 0) {
    return;
  }

  const { data: activeApprovers } = await adminClient
    .from("profiles")
    .select("id")
    .in("id", candidateIds)
    .eq("organization_id", params.organizationId)
    .eq("is_active", true);

  const approvers = activeApprovers ?? [];

  if (approvers.length === 0) {
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
