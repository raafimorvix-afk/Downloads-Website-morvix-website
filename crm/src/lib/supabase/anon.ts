import "server-only";
import { createClient } from "@supabase/supabase-js";

/** No user session: only for public functions guarded by a token or the server secret. */
export function anonClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
