import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// DANGER: this client bypasses RLS completely.
// Import this ONLY inside server-side code (Server Actions, Route Handlers)
// that already checks the caller is an admin BEFORE calling any function here.
// Never import this file in a "use client" component or expose it to the browser.
export function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}
