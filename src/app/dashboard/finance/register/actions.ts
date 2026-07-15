"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { checkPermission } from "@/lib/permissions.server";

type OpenResult = { success: true } | { success: false; error: string };

export async function openRegister(): Promise<OpenResult> {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();

  if (!authData.user) {
    return { success: false, error: "Not authenticated" };
  }

  if (!(await checkPermission("manage_cash_register"))) {
    return { success: false, error: "You don't have permission to manage the cash register" };
  }

  const { error } = await supabase.rpc("open_cash_session");

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath("/dashboard/finance/register");
  revalidatePath("/dashboard");
  return { success: true };
}

type CloseResult =
  | {
      success: true;
      data: {
        expected_cash: number;
        actual_cash_counted: number;
        cash_difference: number;
        visa_total: number;
      };
    }
  | { success: false; error: string };

export async function closeRegister(
  actualCashCounted: number,
  notes: string | null
): Promise<CloseResult> {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();

  if (!authData.user) {
    return { success: false, error: "Not authenticated" };
  }

  if (!(await checkPermission("manage_cash_register"))) {
    return { success: false, error: "You don't have permission to manage the cash register" };
  }

  // Re-validate server-side (the client already checks this, but the action is
  // directly callable): the counted amount must be a finite, non-negative
  // number, and notes are capped to a reasonable length.
  if (!Number.isFinite(actualCashCounted) || actualCashCounted < 0) {
    return { success: false, error: "Enter a valid, non-negative amount." };
  }

  const trimmedNotes = notes?.trim() ? notes.trim().slice(0, 500) : null;

  const { data, error } = await supabase.rpc("close_cash_session", {
    p_actual_cash_counted: actualCashCounted,
    p_notes: trimmedNotes,
  });

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath("/dashboard/finance/register");
  revalidatePath("/dashboard");
  return { success: true, data };
}
