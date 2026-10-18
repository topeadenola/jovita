// Free, Pro and Studio: what each includes, the studio's current plan, and prices in their currency.
import { useEffect, useState } from "react";
import { supabase } from "./supabase";

export const PLANS = [
  { key: "free", name: "Free", line: "Get organised and get paid.", features: ["Clients, projects and bookings", "Invoices with reminders", "Contracts and releases", "Ask Jovita: 10 questions to try it", "Client pages show a small \"Made with Jovita\" mark", "500 MB of gallery storage"] },
  { key: "pro", name: "Pro", line: "Your brand, your assistant.", badge: "Most loved", features: ["Everything in Free", "Ask Jovita: 300 questions a month", "Jovita writes in your voice and remembers what you tell it", "Your logo and colours, no Jovita mark", "1,000 GB of gallery storage"] },
  { key: "studio", name: "Studio", line: "For busy studios and teams.", features: ["Everything in Pro", "Ask Jovita: unlimited", "Smarter answers for long requests", "Priority help from the Jovita team", "Unlimited storage, with RAW photo support"] },
];
export const TRIAL_DAYS = 7;
export const rank = (p) => ["free", "pro", "studio"].indexOf(p);
export const daysLeft = (iso) => (iso ? Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 864e5)) : 0);

export function planFromStudio(s = {}) {
  return { plan: s.plan || "free", status: s.plan_status || "active", trial_ends_at: s.trial_ends_at || null, trial_used: !!s.trial_used };
}

// my_plan also ends an expired trial on the server
export async function loadPlan(studio) {
  try {
    const { data, error } = await supabase.rpc("my_plan");
    if (!error && data?.plan) return data;
  } catch { /* offline: use what we have */ }
  return planFromStudio(studio);
}

// Prices in the studio's currency, plus any live offer set in HQ (for new subscriptions only)
export async function loadPrices(currency) {
  let rows = [], offers = [];
  try {
    const { data, error } = await supabase.rpc("public_pricing");
    if (!error && data) { rows = data.prices || []; offers = data.offers || []; }
    else { const r = await supabase.from("plan_prices").select("plan,currency,monthly_amount").in("currency", [currency, "USD"]); rows = r.data || []; }
  } catch { /* offline */ }
  const pick = (plan) => rows.find((r) => r.plan === plan && r.currency === currency) || rows.find((r) => r.plan === plan && r.currency === "USD") || null;
  const out = Object.fromEntries(["free", "pro", "studio"].map((p) => [p, pick(p)]));
  out.offers = Object.fromEntries(offers.map((o) => [o.plan, o]));
  return out;
}
// 20% off ₦19,500 → ₦15,600 (rounded to a tidy number)
export const offerPrice = (amount, pct) => { const v = (Number(amount) * (100 - pct)) / 100; return v >= 1000 ? Math.round(v / 100) * 100 : Math.round(v * 100) / 100; };

export async function startTrial() {
  const { data, error } = await supabase.rpc("start_pro_trial");
  if (error) throw error;
  return data;
}

// Yearly is 12 months less 5%
export const YEARLY_OFF = 5;
export const yearlyPrice = (monthly) => { const v = Number(monthly) * 12 * (100 - YEARLY_OFF) / 100; return v >= 1000 ? Math.round(v / 100) * 100 : Math.round(v * 100) / 100; };

export async function requestUpgrade(plan, cycle = "month") {
  const { error } = await supabase.rpc("request_plan", { p_plan: plan, p_cycle: cycle });
  if (!error) return;
  // Before update 8 is run, fall back to the older request
  const { error: e2 } = await supabase.rpc("request_upgrade", { p_plan: plan });
  if (e2) throw e2;
}

// One shared copy of the plan for every screen on the phone
let current = null;
const subs = new Set();
export function setPlanAll(p) { current = p; subs.forEach((f) => f(p)); }
export function usePlan(studio) {
  const [p, setP] = useState(() => current || planFromStudio(studio || {}));
  useEffect(() => {
    subs.add(setP);
    if (!current && studio) loadPlan(studio).then(setPlanAll);
    return () => { subs.delete(setP); };
  }, [studio?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  return [p, setPlanAll];
}
