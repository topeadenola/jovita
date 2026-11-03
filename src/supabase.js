import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!url || !key) {
  // Shown in the browser console when .env is missing
  console.error("Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY. Copy .env.example to .env.");
}

// Jovita HQ (/admin) keeps its own sign-in, separate from the studio app, so signing out of one never signs you out of the other
const HQ = typeof location !== "undefined" && location.pathname.startsWith("/admin");
export const supabase = createClient(url, key, HQ ? { auth: { storageKey: "jovita-hq-auth" } } : undefined);
