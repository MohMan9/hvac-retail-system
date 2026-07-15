"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { checkPermission } from "@/lib/permissions.server";

type CreateExpenseResult = { success: false; error: string };

function roundMoney(value: FormDataEntryValue | null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : 0;
}

export async function createExpense(formData: FormData): Promise<CreateExpenseResult> {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();

  if (!authData.user) {
    return { success: false, error: "Not authenticated" };
  }

  if (!(await checkPermission("manage_expenses"))) {
    return { success: false, error: "You don't have permission to manage expenses" };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("organization_id")
    .eq("id", authData.user.id)
    .single();

  if (!profile) {
    return { success: false, error: "No profile found for this account" };
  }

  const { error } = await supabase.from("expenses").insert({
    organization_id: profile.organization_id,
    category: formData.get("category") as string,
    amount: roundMoney(formData.get("amount")),
    expense_date: formData.get("expense_date") as string,
    note: (formData.get("note") as string) || null,
  });

  if (error) {
    return { success: false, error: error.message };
  }

  redirect(`/dashboard/finance/expenses?message=${encodeURIComponent("Expense created.")}`);
}
