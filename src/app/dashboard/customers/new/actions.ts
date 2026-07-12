"use server";

import { createClient } from "@/lib/supabase/server";

type CreatedCustomer = {
  id: string;
  name: string;
  phone: string | null;
  customer_type: string;
};

type CreateCustomerResult =
  | { success: true; customer: CreatedCustomer }
  | { success: false; error: string };

export async function createCustomer(formData: FormData): Promise<CreateCustomerResult> {
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

  const { data: customer, error } = await supabase
    .from("customers")
    .insert({
      organization_id: profile.organization_id,
      name,
      phone,
      customer_type,
    })
    .select("id, name, phone, customer_type")
    .single();

  if (error || !customer) {
    return { success: false, error: error?.message ?? "Failed to create customer" };
  }

  return { success: true, customer };
}
