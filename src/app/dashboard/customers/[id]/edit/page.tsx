import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth.server";
import { CustomerEditForm } from "./customer-edit-form";
import { getServerDictionary } from "@/lib/i18n/get-server-locale";
import { pageTitleClass } from "@/lib/ui";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function EditCustomerPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createClient();
  const authData = await getCurrentUser();
  const { dict } = await getServerDictionary();

  if (!authData.user) {
    redirect("/signin");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("organization_id")
    .eq("id", authData.user.id)
    .single();

  if (!profile) {
    redirect("/signin");
  }

  const { data: customer } = await supabase
    .from("customers")
    .select("id, name, phone, address, customer_type")
    .eq("id", id)
    .eq("organization_id", profile.organization_id)
    .single();

  if (!customer) {
    notFound();
  }

  return (
    <main className="mx-auto max-w-md px-8 py-6">
      <h1 className={`${pageTitleClass} mb-6`}>{dict["customers.editTitle"]}</h1>
      <CustomerEditForm
        customerId={customer.id}
        initialValues={{
          name: customer.name,
          phone: customer.phone,
          address: customer.address,
          customer_type: customer.customer_type,
        }}
      />
    </main>
  );
}
