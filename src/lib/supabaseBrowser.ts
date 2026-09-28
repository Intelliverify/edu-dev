"use client";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

// Lazy browser Supabase client (anon key). Falls back to /api/config when the
// NEXT_PUBLIC_* vars aren't baked into the bundle — same pattern as PhotoUploader.
let _sb: SupabaseClient | null = null;

export async function getBrowserSb(): Promise<SupabaseClient> {
  if (_sb) return _sb;
  let url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  let key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
  if (!url || !key) {
    const cfg = await fetch("/api/config").then((r) => r.json());
    url = cfg.supabaseUrl;
    key = cfg.supabaseKey;
  }
  _sb = createClient(url, key);
  return _sb;
}
