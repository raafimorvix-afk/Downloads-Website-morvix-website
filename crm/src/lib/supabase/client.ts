import { createBrowserClient } from "@supabase/ssr";

// Browser client: used for direct file uploads (call recordings), which are too large to pass through the server.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
}
