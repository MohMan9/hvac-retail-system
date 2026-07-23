import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

// React cache deduplicates this authenticated-user lookup within one server
// render while keeping separate requests isolated from one another.
export const getCurrentUser = cache(async () => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  return data;
});
