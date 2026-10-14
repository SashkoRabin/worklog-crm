import { createBrowserClient } from "@supabase/ssr";

export const isSupabaseConfigured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

// Supabase SSR persists the session in cookies, never in the URL or localStorage.
export const supabase = isSupabaseConfigured
  ? createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
  : null;
