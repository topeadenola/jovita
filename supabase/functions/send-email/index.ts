// Jovita emails, sent through Brevo.
//
// The app calls this with the signed-in creative's token, so Row Level Security means a studio can only
// ever email its own clients (or itself). The function looks up everything it needs and fills a Brevo template.
//
//   POST { kind: "invoice" | "payment_reminder" | "receipt", invoice_id }
//   POST { kind: "contract", project_id }
//   POST { kind: "gallery", gallery_id }
//   POST { kind: "booking", booking_id }
//   POST { kind: "welcome" | "trial_started" | "trial_ending" }      → to the creative themselves
//   POST { kind: "test", template: "<key>" }                         → sends that template to the creative, with sample data
//
// Secrets (Supabase → Edge Functions → Secrets): BREVO_API_KEY. Optional: APP_URL (default https://app.getjovita.com)
// SUPABASE_URL and SUPABASE_ANON_KEY are provided automatically.

const env = (k: string) => Deno.env.get(k) ?? "";
const APP_URL = env("APP_URL") || "https://app.getjovita.com";
const FROM = { email: "hello@getjovita.com", name: "Jovita" };

// Brevo template ids (created in the Jovita Brevo account)
const TEMPLATES: Record<string, number> = {
  welcome: 1, trial_started: 2, trial_ending: 3, payment_received: 4, new_inquiry: 5, contract_signed: 6,
  invoice: 7, payment_reminder: 8, receipt: 9, contract: 10, gallery: 11, booking: 12,
};

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const firstName = (n?: string | null) => (n || "").trim().split(/\s+/)[0] || "there";
const SYMBOL: Record<string, string> = { NGN: "₦", GBP: "£", USD: "$", EUR: "€", GHS: "GH₵", KES: "KSh ", ZAR: "R", XOF: "CFA ", XAF: "FCFA " };
const money = (n: number | string | null, cur = "NGN") =>
  `${SYMBOL[cur] ?? cur + " "}${Number(n || 0).toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
const day = (d?: string | null, withTime = false) => {
  if (!d) return "";
  const x = new Date(d);
  return x.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}) });
};

// Simple REST reads with the user's own token (RLS applies)
function db(auth: string) {
  const base = `${env("SUPABASE_URL")}/rest/v1`;
  return async (path: string) => {
    const r = await fetch(`${base}/${path}`, { headers: { Authorization: auth, apikey: env("SUPABASE_ANON_KEY"), Accept: "application/json" } });
    if (!r.ok) throw new Error(`Couldn't read ${path.split("?")[0]} (${r.status})`);
    return await r.json();
  };
}
const one = async (p: Promise<unknown[]>, what: string) => {
  const rows = await p;
  if (!rows?.length) throw new Error(`${what} not found.`);
  return rows[0] as Record<string, any>;
};

async function brevo(templateId: number, to: { email: string; name?: string }, params: Record<string, unknown>, sender = FROM, replyTo?: { email: string; name?: string }) {
  const key = env("BREVO_API_KEY");
  if (!key) throw new Error("Email isn't set up on the server yet (missing BREVO_API_KEY).");
  const r = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": key, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ templateId, to: [to], params, sender, ...(replyTo ? { replyTo } : {}) }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j?.message || `Brevo error ${r.status}`);
  return j.messageId as string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Not found" }, 404);
  try {
    const auth = req.headers.get("Authorization") || "";
    const ur = await fetch(`${env("SUPABASE_URL")}/auth/v1/user`, { headers: { Authorization: auth, apikey: env("SUPABASE_ANON_KEY") } });
    if (!ur.ok) return json({ error: "Please sign in again." }, 401);
    const user = await ur.json();
    const get = db(auth);
    const studio = await one(get(`studios?owner_id=eq.${user.id}&select=*`), "Studio");
    if (studio.suspended) return json({ error: "This studio is paused." }, 403);

    const logo = studio.logo_path ? `${env("SUPABASE_URL")}/storage/v1/object/public/studio-assets/${studio.logo_path}` : "";
    const studioParams = { studio_name: studio.name || "Your photographer", studio_logo: logo };
    // Client emails go out in the studio's name; replies go straight to the creative.
    const asStudio = { email: FROM.email, name: `${studio.name || "Your photographer"} via Jovita` };
    const replyToStudio = { email: user.email, name: studio.name || undefined };
    const me = { email: user.email as string, name: studio.owner_first_name || undefined };

    const body = await req.json().catch(() => ({}));
    const kind = String(body.kind || "");
    let id: string;

    if (kind === "invoice" || kind === "payment_reminder" || kind === "receipt") {
      const inv = await one(get(`invoices?id=eq.${body.invoice_id}&select=*`), "Invoice");
      const c = await one(get(`clients?id=eq.${inv.client_id}&select=name,email`), "Client");
      if (!c.email) throw new Error(`Add an email for ${c.name} first.`);
      const p = inv.project_id ? (await get(`projects?id=eq.${inv.project_id}&select=title,portal_token`))[0] : null;
      const link = p ? `${APP_URL}/p/${p.portal_token}` : APP_URL;
      const due = inv.due_date ? new Date(inv.due_date) : null;
      const daysLeft = due ? Math.round((due.getTime() - Date.now()) / 864e5) : null;
      const due_text = daysLeft == null ? "due soon" : daysLeft > 1 ? `due in ${daysLeft} days` : daysLeft === 1 ? "due tomorrow" : daysLeft === 0 ? "due today" : `${-daysLeft} day${daysLeft === -1 ? "" : "s"} overdue`;
      const params = {
        ...studioParams, client_first_name: firstName(c.name), invoice_number: inv.number, amount: money(inv.amount, inv.currency),
        due_date: day(inv.due_date) || "on receipt", due_text, project_name: p?.title || inv.label || "Your session", link,
        paid_at: day(inv.paid_at || new Date().toISOString()), method: inv.payment_method || "—", balance: money(0, inv.currency),
      };
      id = await brevo(TEMPLATES[kind], { email: c.email, name: c.name }, params, asStudio, replyToStudio);
    } else if (kind === "contract") {
      const p = await one(get(`projects?id=eq.${body.project_id}&select=*`), "Project");
      const c = await one(get(`clients?id=eq.${p.client_id}&select=name,email`), "Client");
      if (!c.email) throw new Error(`Add an email for ${c.name} first.`);
      id = await brevo(TEMPLATES.contract, { email: c.email, name: c.name },
        { ...studioParams, client_first_name: firstName(c.name), project_name: p.title || "your session", link: `${APP_URL}/p/${p.portal_token}` }, asStudio, replyToStudio);
    } else if (kind === "gallery") {
      const g = await one(get(`galleries?id=eq.${body.gallery_id}&select=*`), "Gallery");
      const c = await one(get(`clients?id=eq.${g.client_id}&select=name,email`), "Client");
      if (!c.email) throw new Error(`Add an email for ${c.name} first.`);
      id = await brevo(TEMPLATES.gallery, { email: c.email, name: c.name }, {
        ...studioParams, client_first_name: firstName(c.name), gallery_name: g.title || "Your gallery", photo_count: String(g.photo_count ?? ""),
        expires_at: g.expires_on ? day(g.expires_on) : "No expiry", link: `${APP_URL}/g/${g.share_token}`,
      }, asStudio, replyToStudio);
    } else if (kind === "booking") {
      const b = await one(get(`bookings?id=eq.${body.booking_id}&select=*`), "Booking");
      const c = await one(get(`clients?id=eq.${b.client_id}&select=name,email`), "Client");
      if (!c.email) throw new Error(`Add an email for ${c.name} first.`);
      const p = b.project_id ? (await get(`projects?id=eq.${b.project_id}&select=portal_token`))[0] : null;
      id = await brevo(TEMPLATES.booking, { email: c.email, name: c.name }, {
        ...studioParams, client_first_name: firstName(c.name), session_name: b.title || "Your session", date: day(b.starts_at, true),
        location: b.location || "To be confirmed", link: p ? `${APP_URL}/p/${p.portal_token}` : APP_URL,
      }, asStudio, replyToStudio);
    } else if (kind === "welcome" || kind === "trial_started" || kind === "trial_ending") {
      id = await brevo(TEMPLATES[kind], me, {
        first_name: studio.owner_first_name || firstName(user.user_metadata?.full_name) || "there",
        app_url: APP_URL, plans_url: `${APP_URL}/settings?tab=plan`, trial_end: day(studio.trial_ends_at) || "soon",
      });
    } else if (kind === "test" && TEMPLATES[body.template]) {
      // Preview any template in your own inbox with sample data
      id = await brevo(TEMPLATES[body.template], me, {
        ...studioParams, first_name: studio.owner_first_name || "there", client_first_name: "Tara", client_name: "Tara Okafor",
        amount: money(250000), invoice_number: "1001", due_date: "29 Oct", due_text: "due in 3 days", project_name: "Sample session",
        method: "Paystack", balance: money(0), paid_at: day(new Date().toISOString()), gallery_name: "Sample gallery", photo_count: "48",
        expires_at: "15 Jan", session_name: "Portrait session", date: "Sat 24 Oct, 10:00", location: "Lagos", message_preview: "Hi! Are you free next month?",
        subject: "Portrait session", received_at: "Today", signed_at: "Today", trial_end: "in 7 days", app_url: APP_URL, plans_url: APP_URL, link: APP_URL,
      }, kind === "test" && ["invoice", "payment_reminder", "receipt", "contract", "gallery", "booking"].includes(body.template) ? asStudio : FROM);
    } else {
      return json({ error: "Unknown email type." }, 400);
    }
    return json({ ok: true, messageId: id });
  } catch (e) {
    return json({ error: (e as Error).message }, 400);
  }
});
