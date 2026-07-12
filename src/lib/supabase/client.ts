import { createBrowserClient } from "@supabase/ssr";

// Use this client inside "use client" components only.
// It reads/writes the session via browser cookies automatically.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
