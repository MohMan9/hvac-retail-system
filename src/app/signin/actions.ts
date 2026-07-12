"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

type SignInResult = { success: false; error: string };

export async function signIn(formData: FormData): Promise<SignInResult> {
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  const supabase = await createClient();

  const { data: authData, error: signInError } =
    await supabase.auth.signInWithPassword({ email, password });

  if (signInError || !authData.user) {
    return { success: false, error: signInError?.message ?? "Invalid email or password" };
  }

  // Look up the caller's role to decide where to send them.
  // Uses the session-aware client, so this is scoped by RLS to the logged-in user.
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role, is_active")
    .eq("id", authData.user.id)
    .single();

  if (profileError || !profile) {
    return { success: false, error: "No profile found for this account" };
  }

  // RLS can't block a Supabase Auth session from being created in the first
  // place — only from reading/writing data afterward — so deactivation has
  // to be enforced here, right after sign-in, by immediately signing back out.
  if (profile.is_active === false) {
    await supabase.auth.signOut();
    return { success: false, error: "This account has been deactivated." };
  }

  // All roles land on /dashboard; admins reach /admin via the nav link there
  // instead of being redirected straight to it on sign-in.
  redirect("/dashboard");
}

export async function signOut() {
  const supabase = await createClient();

  // Sign-out failures are rare (e.g. already-expired session) and there's no
  // client-side handler consuming a return value here — it's posted straight
  // from a <form> in the nav bar. Either way the user ends up back on
  // /signin, so we don't need a structured error branch for this one.
  await supabase.auth.signOut();

  redirect("/signin");
}
