// Lemon Squeezy webhook: keeps each studio's plan in step with its subscription.
//
// subscription_created / updated / resumed / cancelled / expired → plan on, renewal date, or back to Free
// subscription_payment_success → money recorded in HQ › Revenue (once per invoice) and the plan extended
// subscription_payment_failed  → "Payment failed" in HQ
//
// Every request is checked against the signing secret, so nobody else can switch plans on.
// Secrets: LEMONSQUEEZY_WEBHOOK_SECRET, LEMONSQUEEZY_API_KEY. Provided automatically: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.

import { ls, variantInfo } from "../_shared/lemon.ts";

const env = (k: string) => Deno.env.get(k) ?? "";
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "Content-Type": "application/json" } });
const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

async function signed(raw: string, sig: string) {
  const secret = env("LEMONSQUEEZY_WEBHOOK_SECRET");
  if (!secret || !sig) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mine = hex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(raw)));
  if (mine.length !== sig.length) return false;
  let d = 0;
  for (let i = 0; i < mine.length; i++) d |= mine.charCodeAt(i) ^ sig.charCodeAt(i);
  return d === 0;
}

async function rpc(fn: string, args: Record<string, unknown>) {
  const k = env("SUPABASE_SERVICE_ROLE_KEY");
  const r = await fetch(`${env("SUPABASE_URL")}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${k}`, apikey: k, "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
  const t = await r.text();
  if (!r.ok) throw new Error(`${fn}: ${t}`);
  return t ? JSON.parse(t) : null;
}

async function studioFor(custom: Record<string, string> | undefined, subId: string) {
  if (custom?.studio_id) return custom.studio_id;
  const k = env("SUPABASE_SERVICE_ROLE_KEY");
  const r = await fetch(`${env("SUPABASE_URL")}/rest/v1/studios?select=id&lemon_subscription_id=eq.${encodeURIComponent(subId)}&limit=1`, { headers: { Authorization: `Bearer ${k}`, apikey: k } });
  return r.ok ? (await r.json())[0]?.id || null : null;
}

// plan + cycle from the variant they're on now (they may have switched on their billing page), else from the checkout
async function planOf(variantId: unknown, custom: Record<string, string> | undefined) {
  const v = variantId ? await variantInfo(String(variantId)).catch(() => null) : null;
  return { plan: v?.plan || custom?.plan || "pro", cycle: v?.cycle || custom?.cycle || "month" };
}

async function sync(studio: string, subId: string, a: Record<string, unknown>, custom: Record<string, string> | undefined) {
  const { plan, cycle } = await planOf(a.variant_id, custom);
  return rpc("lemon_sync", {
    p_studio: studio, p_plan: plan, p_cycle: cycle, p_status: String(a.status || "active"),
    p_renews: a.renews_at || null, p_ends: a.ends_at || null, p_sub: subId, p_customer: a.customer_id != null ? String(a.customer_id) : null,
  });
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  const raw = await req.text();
  if (!(await signed(raw, req.headers.get("X-Signature") || ""))) return json({ error: "bad signature" }, 401);

  let body: { meta?: { event_name?: string; custom_data?: Record<string, string> }; data?: { id?: string; attributes?: Record<string, unknown> } };
  try { body = JSON.parse(raw); } catch { return json({ error: "bad json" }, 400); }
  const event = body.meta?.event_name || "";
  const custom = body.meta?.custom_data;
  const a = body.data?.attributes || {};

  try {
    if (event.startsWith("subscription_payment_")) {
      // data is the invoice; look up its subscription for the plan and the next renewal date
      const subId = String(a.subscription_id || "");
      const studio = await studioFor(custom, subId);
      if (!studio) return json({ ok: true, skipped: "no studio" });
      if (event === "subscription_payment_failed") { await rpc("lemon_failed", { p_studio: studio }); return json({ ok: true }); }
      if (event !== "subscription_payment_success" || a.status !== "paid") return json({ ok: true, skipped: event });
      const sub = (await ls(`/subscriptions/${subId}`)).data?.attributes || {};
      await sync(studio, subId, sub, custom);
      const { plan, cycle } = await planOf(sub.variant_id, custom);
      await rpc("lemon_paid", {
        p_studio: studio, p_plan: plan, p_cycle: cycle,
        p_amount: Number(a.total || 0) / 100, p_currency: String(a.currency || "NGN"),
        p_invoice: String(body.data?.id || ""), p_until: sub.renews_at || null,
      });
      return json({ ok: true });
    }

    if (event.startsWith("subscription_")) {
      const subId = String(body.data?.id || "");
      const studio = await studioFor(custom, subId);
      if (!studio) return json({ ok: true, skipped: "no studio" });
      await sync(studio, subId, a, custom);
      return json({ ok: true });
    }

    return json({ ok: true, skipped: event });
  } catch (e) {
    // a 500 makes Lemon Squeezy try again later
    return json({ error: (e as Error).message }, 500);
  }
});
