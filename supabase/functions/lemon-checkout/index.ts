// Lemon Squeezy checkout for Jovita plans.
//
// POST { action: "checkout", plan: "pro" | "studio", cycle: "month" | "year" } → { url } to the Lemon Squeezy checkout page
// POST { action: "portal" } → { url } to the customer's own billing page (change plan, card, cancel, receipts)
//
// The signed-in user's studio is sent along as custom data, so the webhook (lemon-webhook) knows whose plan to switch on.
// Secrets: LEMONSQUEEZY_API_KEY. Optional: LEMONSQUEEZY_STORE_ID (defaults to the Jovita store), APP_URL.
// Provided automatically: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY.

import { ls, STORE, variants } from "../_shared/lemon.ts";

const env = (k: string) => Deno.env.get(k) ?? "";
const APP_URL = env("APP_URL") || "https://app.getjovita.com";
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  if (!env("LEMONSQUEEZY_API_KEY")) return json({ error: "Payments aren't set up yet" }, 503);
  const base = env("SUPABASE_URL");
  const auth = req.headers.get("Authorization") || "";

  // Who is asking
  const ur = await fetch(`${base}/auth/v1/user`, { headers: { Authorization: auth, apikey: env("SUPABASE_ANON_KEY") } });
  if (!ur.ok) return json({ error: "Please sign in again" }, 401);
  const user = await ur.json();
  const sk = env("SUPABASE_SERVICE_ROLE_KEY");
  const sr = await fetch(`${base}/rest/v1/studios?select=id,name,owner_first_name,lemon_subscription_id,plan_autorenew&owner_id=eq.${user.id}&limit=1`, {
    headers: { Authorization: `Bearer ${sk}`, apikey: sk },
  });
  const studio = sr.ok ? (await sr.json())[0] : null;
  if (!studio) return json({ error: "No studio found for this account" }, 404);

  let body: { action?: string; plan?: string; cycle?: string } = {};
  try { body = await req.json(); } catch { /* empty */ }

  try {
    if (body.action === "portal") {
      if (!studio.lemon_subscription_id) return json({ error: "No subscription yet" }, 404);
      const s = await ls(`/subscriptions/${studio.lemon_subscription_id}`);
      const url = s.data?.attributes?.urls?.customer_portal;
      return url ? json({ url }) : json({ error: "Billing page not available" }, 502);
    }

    const plan = body.plan === "studio" ? "studio" : body.plan === "pro" ? "pro" : "";
    const cycle = body.cycle === "year" ? "year" : "month";
    if (!plan) return json({ error: "Pick Pro or Studio" }, 400);

    // Already subscribing: changes happen on their billing page, so they're never charged twice
    if (studio.lemon_subscription_id && studio.plan_autorenew) {
      const s = await ls(`/subscriptions/${studio.lemon_subscription_id}`);
      const url = s.data?.attributes?.urls?.customer_portal;
      if (url) return json({ url, portal: true });
    }

    const map = await variants();
    const variant = map[`${plan}:${cycle}`];
    if (!variant) return json({ error: `The ${plan} ${cycle === "year" ? "yearly" : "monthly"} price isn't set up in Lemon Squeezy yet` }, 404);

    const co = await ls("/checkouts", {
      method: "POST",
      body: JSON.stringify({
        data: {
          type: "checkouts",
          attributes: {
            checkout_data: {
              email: user.email,
              name: studio.owner_first_name || undefined,
              custom: { studio_id: studio.id, plan, cycle },
            },
            product_options: { redirect_url: `${APP_URL}/settings?tab=plan&paid=1`, receipt_button_text: "Open Jovita", receipt_link_url: APP_URL },
            checkout_options: { embed: false },
          },
          relationships: {
            store: { data: { type: "stores", id: STORE } },
            variant: { data: { type: "variants", id: variant } },
          },
        },
      }),
    });
    const url = co.data?.attributes?.url;
    return url ? json({ url }) : json({ error: "Couldn't open the checkout" }, 502);
  } catch (e) {
    return json({ error: (e as Error).message }, 502);
  }
});
