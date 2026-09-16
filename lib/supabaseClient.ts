import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// If these are missing, the app still runs entirely offline/local (Dexie
// only) — sync is treated as an optional enhancement, not a hard
// dependency, since Uganda connectivity means "no internet" is a normal
// state, not an error state.
export const supabaseConfigured = Boolean(url && anonKey);

export const supabase = supabaseConfigured
  ? createClient(url!, anonKey!, {
      auth: { persistSession: true, autoRefreshToken: true },
    })
  : null;
