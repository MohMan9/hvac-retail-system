"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

type UpdateCustomerResult = { success: false; error: string };

export async function updateCustomer(
  customerId: string,
  formData: FormData
): Promise<UpdateCustomerResult> {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();

  if (!authData.user) {
    return { success: false, error: "Not authenticated" };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("organization_id")
    .eq("id", authData.user.id)
    .single();

  if (!profile) {
    return { success: false, error: "No profile found for this account" };
  }

  const name = formData.get("name") as string;
  const phone = (formData.get("phone") as string) || null;
  const customer_type = formData.get("customer_type") as string;

  const { error } = await supabase
    .from("customers")
    .update({ name, phone, customer_type })
    .eq("id", customerId)
    .eq("organization_id", profile.organization_id);

  if (error) {
    return { success: false, error: error.message };
  }

  redirect(`/dashboard/customers/${customerId}`);
}
