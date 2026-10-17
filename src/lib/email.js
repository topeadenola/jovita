// Sends Jovita emails through the "send-email" Supabase function (Brevo).
// The function runs with the person's own login, so a studio can only email its own clients.
// Returns { ok: true } or { ok: false, reason } so callers can fall back to copying the link.
import { supabase } from "../supabase";

export async function sendEmail(kind, ids = {}) {
  try {
    const { data, error } = await supabase.functions.invoke("send-email", { body: { kind, ...ids } });
    if (error) {
      let body = null;
      try { body = await error.context?.json(); } catch { /* not JSON */ }
      return { ok: false, reason: body?.error || "Email couldn't be sent right now." };
    }
    return data?.ok ? { ok: true } : { ok: false, reason: data?.error || "Email couldn't be sent right now." };
  } catch (e) {
    return { ok: false, reason: e.message };
  }
}
