// Talks to the Jovita brain (Supabase Edge Function "ask-jovita").
// The function runs with the person's own login, so it only ever sees their studio.
// If the brain is off (no key yet), offline, or over the monthly limit, Ask Jovita falls back to the built-in rules.
import { supabase } from "./supabase";

import { tx } from "./i18n";

let off = false; // brain not switched on: stop asking for this visit
export const brainOff = () => off;

const FALLBACK = new Set(["no_key", "ai", "network", "studio", "bad_request"]);

export async function askBrain(log, { lang, smart } = {}) {
  if (off) return { ok: false, error: "no_key", fallback: true };
  const messages = log
    .filter((m) => m.who === "me" || m.who === "jo")
    .map((m) => ({
      role: m.who === "me" ? "user" : "assistant",
      content: [m.text || "", ...(m.drafts || []).map((d) => `(Draft for ${d.to}: ${d.text})`)].join("\n").trim(),
    }))
    .filter((m) => m.content)
    .slice(-20);
  let tz = "UTC";
  try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; } catch { /* old browser */ }
  try {
    const { data, error } = await supabase.functions.invoke("ask-jovita", { body: { messages, now: new Date().toString(), tz, lang, smart } });
    if (error) {
      let body = null;
      try { body = await error.context?.json(); } catch { /* not JSON */ }
      const code = body?.error || (error.name === "FunctionsFetchError" ? "network" : "ai");
      if (code === "no_key") off = true;
      return { ok: false, error: code, message: body?.message || "", quota: body?.quota, fallback: FALLBACK.has(code) || code === "limit" || code === "slow_down" };
    }
    if (!data || typeof data.text !== "string") return { ok: false, error: "ai", fallback: true };
    return { ok: true, ...data };
  } catch {
    return { ok: false, error: "network", fallback: true };
  }
}

// "3 free Jovita questions left." / "4 Jovita questions left this month." / nothing when unlimited
export function leftNote(q) {
  if (!q || q.limit == null) return "";
  const left = Math.max(0, q.limit - q.used);
  if (q.period === "total") return left <= 3 ? "\n\n" + (left === 1 ? tx("1 free Jovita question left. Upgrade to keep going.") : tx("{n} free Jovita questions left. Upgrade to keep going.", { n: left })) : "";
  return left <= 5 ? "\n\n" + tx("{n} Jovita questions left this month.", { n: left }) : "";
}
