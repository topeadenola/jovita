// Shared Lemon Squeezy helpers for lemon-checkout and lemon-webhook.
const env = (k: string) => Deno.env.get(k) ?? "";
export const STORE = env("LEMONSQUEEZY_STORE_ID") || "503489";
const LS = "https://api.lemonsqueezy.com/v1";

export async function ls(path: string, init: RequestInit = {}) {
  const r = await fetch(LS + path, {
    ...init,
    headers: { Accept: "application/vnd.api+json", "Content-Type": "application/vnd.api+json", Authorization: `Bearer ${env("LEMONSQUEEZY_API_KEY")}` },
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(body?.errors?.[0]?.detail || `Lemon Squeezy ${r.status}`);
  return body;
}

// Which variant is Pro monthly, Studio yearly, etc. Worked out from the product names and billing intervals.
let cache: { at: number; map: Record<string, string> } | null = null;
export async function variants() {
  if (cache && Date.now() - cache.at < 10 * 60e3) return cache.map;
  const prods = await ls(`/products?filter[store_id]=${STORE}&page[size]=50`);
  const map: Record<string, string> = {};
  for (const p of prods.data || []) {
    const name = String(p.attributes?.name || "").toLowerCase();
    const plan = name.includes("studio") ? "studio" : name.includes("pro") ? "pro" : "";
    if (!plan || p.attributes?.status !== "published") continue;
    const vs = await ls(`/variants?filter[product_id]=${p.id}&page[size]=50`);
    for (const v of vs.data || []) {
      const a = v.attributes || {};
      if (!a.is_subscription || a.status === "draft") continue;
      const cycle = a.interval === "year" ? "year" : a.interval === "month" ? "month" : "";
      if (!cycle) continue;
      const key = `${plan}:${cycle}`;
      // a product's own default variant is "pending" once real variants are added; prefer published ones
      if (!map[key] || a.status === "published") map[key] = String(v.id);
    }
  }
  cache = { at: Date.now(), map };
  return map;
}


// variant id → { plan, cycle }
export async function variantInfo(id: string | number) {
  const map = await variants();
  for (const [k, v] of Object.entries(map)) if (v === String(id)) { const [plan, cycle] = k.split(":"); return { plan, cycle }; }
  return null;
}
