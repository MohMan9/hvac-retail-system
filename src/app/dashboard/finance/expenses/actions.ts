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

  const category = ((formData.get("category") as string) ?? "").trim();

  if (!category) {
    return { success: false, error: "Choose or enter a category." };
  }

  // Persist a brand-new category name to expense_categories so it appears in the
  // dropdown next time. This is a UI convenience list (the expenses.category
  // column has no FK), so a failure here must not block the expense itself — we
  // insert only when the name is new and ignore any error (e.g. a concurrent add
  // hitting a unique constraint).
  const { data: existingCategory } = await supabase
    .from("expense_categories")
    .select("id")
    .eq("organization_id", profile.organization_id)
    .eq("name", category)
    .maybeSingle();

  if (!existingCategory) {
    await supabase
      .from("expense_categories")
      .insert({ organization_id: profile.organization_id, name: category });
  }

  const { error } = await supabase.from("expenses").insert({
    organization_id: profile.organization_id,
    category,
    amount: roundMoney(formData.get("amount")),
    expense_date: formData.get("expense_date") as string,
    note: (formData.get("note") as string) || null,
  });

  if (error) {
    return { success: false, error: error.message };
  }

  redirect(`/dashboard/finance/expenses?message=${encodeURIComponent("Expense created.")}`);
}
