// A studio's own domain for client links (Studio plan), e.g. gallery.horploadworks.com.
//
// POST { action: "add", domain }  → registers the domain with Cloudflare (Cloudflare for SaaS) and points it at the app.
//      Returns { domain, status, target } — the studio then adds a CNAME record: <domain> → target.
// POST { action: "check" }         → asks Cloudflare whether the domain is live yet. { status, problem }
// POST { action: "remove" }        → disconnects it.
//
// Secrets: CF_API_TOKEN (Zone › SSL and Certificates: Edit, Zone › Workers Routes: Edit, for getjovita.com), CF_ZONE_ID.
// Optional: CF_SAAS_TARGET (default studios.getjovita.com), CF_WORKER (default jovita-app).

const env = (k: string) => Deno.env.get(k) ?? "";
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });
const TARGET = () => env("CF_SAAS_TARGET") || "studios.getjovita.com";

async function cf(path: string, init: RequestInit = {}) {
  const r = await fetch(`https://api.cloudflare.com/client/v4/zones/${env("CF_ZONE_ID")}${path}`, {
    ...init, headers: { Authorization: `Bearer ${env("CF_API_TOKEN")}`, "Content-Type": "application/json", ...(init.headers || {}) },
  });
  const j = await r.json().catch(() => ({}));
  if (!j.success) throw new Error(j.errors?.[0]?.message || `Cloudflare said ${r.status}`);
  return j.result;
}

// Live only when Cloudflare has checked the domain and issued its certificate
const stateOf = (h: { status?: string; ssl?: { status?: string; validation_errors?: { message: string }[] }; verification_errors?: string[] }) => {
  const live = h.status === "active" && h.ssl?.status === "active";
  const problem = h.verification_errors?.[0] || h.ssl?.validation_errors?.[0]?.message || "";
  return { status: live ? "active" : "pending", problem };
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  if (!env("CF_API_TOKEN") || !env("CF_ZONE_ID")) return json({ error: "Own domains aren't switched on yet. Ask Jovita support." }, 503);
  const base = env("SUPABASE_URL"), sk = env("SUPABASE_SERVICE_ROLE_KEY");
  const svc = { Authorization: `Bearer ${sk}`, apikey: sk, "Content-Type": "application/json" };

  const ur = await fetch(`${base}/auth/v1/user`, { headers: { Authorization: req.headers.get("Authorization") || "", apikey: env("SUPABASE_ANON_KEY") } });
  if (!ur.ok) return json({ error: "Please sign in again" }, 401);
  const user = await ur.json();
  const sr = await fetch(`${base}/rest/v1/studios?owner_id=eq.${user.id}&select=id,plan,custom_domain,custom_domain_id,custom_domain_status&limit=1`, { headers: svc });
  const studio = sr.ok ? (await sr.json())[0] : null;
  if (!studio) return json({ error: "No studio found for this account" }, 404);
  const save = (patch: Record<string, unknown>) => fetch(`${base}/rest/v1/studios?id=eq.${studio.id}`, { method: "PATCH", headers: svc, body: JSON.stringify(patch) });

  let body: { action?: string; domain?: string } = {};
  try { body = await req.json(); } catch { /* empty */ }

  try {
    if (body.action === "add") {
      if (studio.plan !== "studio") return json({ error: "Your own domain is part of the Studio plan." }, 403);
      const domain = String(body.domain || "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/\.$/, "");
      if (!/^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/.test(domain)) return json({ error: "That doesn't look like a web address. Try gallery.yourstudio.com" }, 400);
      if (/(^|\.)getjovita\.com$/.test(domain)) return json({ error: "Use a domain you own, e.g. gallery.yourstudio.com" }, 400);
      if (domain.split(".").length < 3) return json({ error: "Use a sub-address like gallery.yourstudio.com, so your main website keeps working." }, 400);
      const taken = await fetch(`${base}/rest/v1/studios?custom_domain=eq.${encodeURIComponent(domain)}&id=neq.${studio.id}&select=id`, { headers: svc });
      if (taken.ok && (await taken.json()).length) return json({ error: "Another studio is already using that domain." }, 409);
      // Swap out an old domain first
      if (studio.custom_domain_id) await cf(`/custom_hostnames/${studio.custom_domain_id}`, { method: "DELETE" }).catch(() => {});
      const h = await cf("/custom_hostnames", { method: "POST", body: JSON.stringify({ hostname: domain, ssl: { method: "http", type: "dv", settings: { min_tls_version: "1.2" } } }) });
      await cf("/workers/routes", { method: "POST", body: JSON.stringify({ pattern: `${domain}/*`, script: env("CF_WORKER") || "jovita-app" }) }).catch((e) => { if (!/already|exists|duplicate/i.test(e.message)) throw e; });
      await save({ custom_domain: domain, custom_domain_id: h.id, custom_domain_status: "pending" });
      return json({ domain, status: "pending", target: TARGET() });
    }

    if (body.action === "check") {
      if (!studio.custom_domain_id) return json({ status: "none" });
      const h = await cf(`/custom_hostnames/${studio.custom_domain_id}`);
      const s = stateOf(h);
      if (s.status !== studio.custom_domain_status) await save({ custom_domain_status: s.status });
      return json({ ...s, domain: studio.custom_domain, target: TARGET() });
    }

    if (body.action === "remove") {
      if (studio.custom_domain_id) await cf(`/custom_hostnames/${studio.custom_domain_id}`, { method: "DELETE" }).catch(() => {});
      if (studio.custom_domain) {
        const routes = await cf("/workers/routes").catch(() => []);
        const r = (routes || []).find((x: { pattern: string }) => x.pattern === `${studio.custom_domain}/*`);
        if (r) await cf(`/workers/routes/${r.id}`, { method: "DELETE" }).catch(() => {});
      }
      await save({ custom_domain: null, custom_domain_id: null, custom_domain_status: "none" });
      return json({ status: "none" });
    }
  } catch (e) {
    return json({ error: String((e as Error).message || e).slice(0, 200) }, 502);
  }
  return json({ error: "Unknown action" }, 400);
});
