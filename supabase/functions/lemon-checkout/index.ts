// Lemon Squeezy checkout for Jovita plans.
//
// POST { action: "checkout", plan: "pro" | "studio", cycle: "month" | "year" } → { url } to the Lemon Squeezy checkout page
// POST { action: "portal" } → { url } to the customer's own billing page (card, receipts)
// POST { action: "change", plan: "pro" | "studio" | "free" } → already subscribed: upgrades start now (you pay the difference),
//      downgrades and Free wait for the next renewal date. { mode: "now" | "later", at }
// POST { action: "undo" } → cancel a waiting downgrade, or un-cancel before the end date
// POST { action: "addon" } → { url } checkout for 250 GB of extra storage ($5 a month), paid plans only
// POST { action: "addon_cancel", sub } → stop an extra-storage add-on at the end of its paid month
//
// The signed-in user's studio is sent along as custom data, so the webhook (lemon-webhook) knows whose plan to switch on.
// Secrets: LEMONSQUEEZY_API_KEY. Optional: LEMONSQUEEZY_STORE_ID (defaults to the Jovita store), APP_URL.
// Provided automatically: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY.

import { ls, STORE, variantInfo, variants } from "../_shared/lemon.ts";

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
  const sr = await fetch(`${base}/rest/v1/studios?select=id,name,owner_first_name,plan,plan_status,plan_next,plan_next_at,lemon_subscription_id,plan_autorenew&owner_id=eq.${user.id}&limit=1`, {
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

    if (body.action === "addon" || body.action === "addon_cancel") {
      if (body.action === "addon_cancel") {
        const sub = String((body as { sub?: string }).sub || "");
        const ar = await fetch(`${base}/rest/v1/storage_addons?select=id&studio_id=eq.${studio.id}&lemon_subscription_id=eq.${encodeURIComponent(sub)}`, { headers: { Authorization: `Bearer ${sk}`, apikey: sk } });
        if (!ar.ok || !(await ar.json()).length) return json({ error: "Not found" }, 404);
        await ls(`/subscriptions/${encodeURIComponent(sub)}`, { method: "DELETE" });
        return json({ ok: true });
      }
      if (!["pro", "studio"].includes(studio.plan) || studio.plan_status === "trialing") return json({ error: "Extra storage is for Pro and Studio. Upgrade first." }, 400);
      const v = (await variants())["storage:month"];
      if (!v) return json({ error: "Extra storage isn't set up in Lemon Squeezy yet" }, 404);
      const co = await ls("/checkouts", {
        method: "POST",
        body: JSON.stringify({ data: { type: "checkouts",
          attributes: { checkout_data: { email: user.email, name: studio.owner_first_name || undefined, custom: { studio_id: studio.id, plan: "storage", gb: "250" } },
            product_options: { redirect_url: `${APP_URL}/settings?tab=plan&storage=1`, receipt_button_text: "Open Jovita", receipt_link_url: APP_URL } },
          relationships: { store: { data: { type: "stores", id: STORE } }, variant: { data: { type: "variants", id: v } } } } }),
      });
      const url = co.data?.attributes?.url;
      return url ? json({ url }) : json({ error: "Couldn't open the checkout" }, 502);
    }

    const rank = (p: string) => ["free", "pro", "studio"].indexOf(p);
    const patchStudio = (patch: Record<string, unknown>) => fetch(`${base}/rest/v1/studios?id=eq.${studio.id}`, {
      method: "PATCH", headers: { Authorization: `Bearer ${sk}`, apikey: sk, "Content-Type": "application/json" }, body: JSON.stringify(patch),
    });
    const setVariant = (id: string, attrs: Record<string, unknown>) => ls(`/subscriptions/${studio.lemon_subscription_id}`, {
      method: "PATCH", body: JSON.stringify({ data: { type: "subscriptions", id: String(studio.lemon_subscription_id), attributes: { variant_id: Number(id), ...attrs } } }),
    });

    if (body.action === "change" || body.action === "undo") {
      if (!studio.lemon_subscription_id) return json({ error: "No subscription yet" }, 404);
      const sub = (await ls(`/subscriptions/${studio.lemon_subscription_id}`)).data?.attributes || {};
      const now = await variantInfo(sub.variant_id);
      const cycle = now?.cycle || "month";
      const map = await variants();

      if (body.action === "undo") {
        if (sub.cancelled) { await ls(`/subscriptions/${studio.lemon_subscription_id}`, { method: "PATCH", body: JSON.stringify({ data: { type: "subscriptions", id: String(studio.lemon_subscription_id), attributes: { cancelled: false } } }) }); }
        else if (studio.plan_next && now?.plan !== studio.plan) { await setVariant(map[`${studio.plan}:${cycle}`], { disable_prorations: true }); }
        await patchStudio({ plan_next: null, plan_next_at: null, plan_autorenew: true });
        return json({ ok: true });
      }

      const want = body.plan === "studio" ? "studio" : body.plan === "pro" ? "pro" : body.plan === "free" ? "free" : "";
      if (!want) return json({ error: "Pick a plan" }, 400);
      const renews = sub.renews_at || sub.ends_at;
      if (want === "free") {
        // Cancels at the end of what they've paid for; nothing more is charged
        await patchStudio({ plan_next: "free", plan_next_at: renews });
        await ls(`/subscriptions/${studio.lemon_subscription_id}`, { method: "DELETE" });
        return json({ ok: true, mode: "later", at: renews });
      }
      const target = map[`${want}:${cycle}`];
      if (!target) return json({ error: `The ${want} price isn't set up in Lemon Squeezy yet` }, 404);
      if (rank(want) > rank(studio.plan)) {
        // Upgrade now: they pay the difference for the rest of this period today
        await patchStudio({ plan_next: null, plan_next_at: null });
        await setVariant(target, { invoice_immediately: true });
        return json({ ok: true, mode: "now" });
      }
      // Downgrade at the next renewal: keep the higher plan until then, then charge the lower price
      await patchStudio({ plan_next: want, plan_next_at: renews });
      try { await setVariant(target, { disable_prorations: true }); }
      catch (e) { await patchStudio({ plan_next: null, plan_next_at: null }); throw e; }
      return json({ ok: true, mode: "later", at: renews });
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
