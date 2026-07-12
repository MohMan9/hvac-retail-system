"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

type OpenResult = { success: true } | { success: false; error: string };

export async function openRegister(): Promise<OpenResult> {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();

  if (!authData.user) {
    return { success: false, error: "Not authenticated" };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", authData.user.id)
    .single();

  if (!profile || (profile.role !== "manager" && profile.role !== "admin")) {
    return { success: false, error: "Only managers and admins can open the cash register" };
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

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", authData.user.id)
    .single();

  if (!profile || (profile.role !== "manager" && profile.role !== "admin")) {
    return { success: false, error: "Only managers and admins can close the cash register" };
  }

  const { data, error } = await supabase.rpc("close_cash_session", {
    p_actual_cash_counted: actualCashCounted,
    p_notes: notes,
  });

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath("/dashboard/finance/register");
  revalidatePath("/dashboard");
  return { success: true, data };
}
