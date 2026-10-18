// Jovita emails, sent through Brevo.
//
// The app calls this with the signed-in creative's token, so Row Level Security means a studio can only
// ever email its own clients (or itself). The function looks up everything it needs and fills a Brevo template.
//
//   POST { kind: "invoice" | "payment_reminder" | "receipt", invoice_id }
//   POST { kind: "contract", project_id }
//   POST { kind: "gallery", gallery_id, invite_id? }
//   POST { kind: "booking", booking_id }
//   POST { kind: "welcome" | "trial_started" | "trial_ending" }      → to the creative themselves
//   POST { kind: "test", template: "<key>" }                         → sends that template to the creative, with sample data
//   POST { kind: "quote", invoice_id }                               → the quote to the client
//   POST { kind: "quote_accepted", token, invoice_id }               → from the client page (no login): emails the new invoice
//                                                                      to the client and tells the studio. Only once per quote.
//   POST { kind: "message", client_id, body, subject? }               → a reply written in the Jovita Inbox, emailed to the client
//   Any client email: add copy_me: true (or turn on "Send me a copy" in Settings) to get a copy (BCC).
//
// Secrets (Supabase → Edge Functions → Secrets): BREVO_API_KEY. Optional: APP_URL (default https://app.getjovita.com),
// INBOX_DOMAIN (e.g. getjovita.com, once Email Routing + the jovita-mail Worker are set up): client replies then come back into the Inbox.
// SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are provided automatically.
// Deployed with verify_jwt off: every path checks the login itself, except quote_accepted, which checks the client page token.

const env = (k: string) => Deno.env.get(k) ?? "";
const APP_URL = env("APP_URL") || "https://app.getjovita.com";
const FROM = { email: "hello@getjovita.com", name: "Jovita" };

// Brevo template ids (created in the Jovita Brevo account)
const TEMPLATES: Record<string, number> = {
  welcome: 1, trial_started: 2, trial_ending: 3, payment_received: 4, new_inquiry: 5, contract_signed: 6,
  invoice: 7, payment_reminder: 8, receipt: 9, contract: 10, gallery: 11, booking: 12, quote: 14, quote_accepted: 15,
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

type Who = { email: string; name?: string };
// The gallery email is built here (not from a Brevo template) so it can carry the gallery password when there is one
const escH = (v: unknown) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
function galleryEmail(p: Record<string, string>) {
  const F = "Figtree,'Segoe UI',Helvetica,Arial,sans-serif", B = "'Bricolage Grotesque','Trebuchet MS',Arial,sans-serif";
  const row = (k: string, v: string) => `<tr><td style="padding:12px 0;border-bottom:1px solid #E4DCEE;font:400 15px/1.4 ${F};color:#5E5069">${k}</td><td align="right" style="padding:12px 0;border-bottom:1px solid #E4DCEE;font:700 15px/1.4 ${F};color:#261433">${escH(v)}</td></tr>`;
  const pw = p.password ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px"><tr><td style="background:#FFF4DC;border:1px solid #F5D48A;border-radius:14px;padding:16px 18px">
    <p style="margin:0 0 6px;font:800 12px/1 ${F};letter-spacing:1.4px;text-transform:uppercase;color:#8F5A00">Gallery password</p>
    <p style="margin:0;font:800 24px/1.2 ui-monospace,Menlo,Consolas,monospace;letter-spacing:2px;color:#261433">${escH(p.password)}</p>
    <p style="margin:6px 0 0;font:400 13px/1.5 ${F};color:#5E5069">You'll be asked for it once when you open the gallery.</p></td></tr></table>` : "";
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"><title>${escH(p.client_first_name)}, your photos are here.</title><link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,800&family=Figtree:wght@400;700;800&display=swap" rel="stylesheet"><style>@media (max-width:620px){.card{padding:28px 22px !important} .h1{font-size:28px !important}}</style></head>
<body style="margin:0;padding:0;background:#F4EFFA"><div style="display:none;max-height:0;overflow:hidden;opacity:0">${escH(p.gallery_name)} is ready to view and download.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#F4EFFA"><tr><td align="center" style="padding:32px 12px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px">
<tr><td style="padding:0 8px 20px">${p.studio_logo ? `<img src="${escH(p.studio_logo)}" width="40" height="40" alt="" style="display:inline-block;vertical-align:middle;border:0;border-radius:10px;margin-right:10px;object-fit:cover">` : ""}<span style="font:800 20px/1 ${B};color:#261433;vertical-align:middle">${escH(p.studio_name)}</span></td></tr>
<tr><td class="card" style="background:#ffffff;border-radius:22px;padding:40px 40px 28px;border:1px solid #E4DCEE">
<p style="margin:0 0 10px;font:800 12px/1 ${F};letter-spacing:1.6px;text-transform:uppercase;color:#8F5A00">Gallery</p>
<h1 class="h1" style="margin:0 0 18px;font:800 32px/1.12 ${B};color:#261433;letter-spacing:-0.6px">${escH(p.client_first_name)}${p.client_first_name ? ", y" : "Y"}our photos are here.</h1>
<p style="margin:0 0 16px;font:400 16px/1.6 ${F};color:#261433"><strong>${escH(p.gallery_name)}</strong> is ready. Pick your favourites, download, and share.</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 24px">${row("Photos", p.photo_count)}${row("Available until", p.expires_at)}</table>
${pw}
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 24px"><tr><td style="border-radius:12px;background:#261433"><a href="${escH(p.link)}" target="_blank" style="display:inline-block;padding:15px 28px;font:700 16px/1 ${F};color:#ffffff;text-decoration:none;border-radius:12px">Open my gallery</a></td></tr></table>
<p style="margin:8px 0 16px;font:400 16px/1.6 ${F};color:#261433">Thank you,<br><strong>${escH(p.studio_name)}</strong></p></td></tr>
<tr><td style="padding:22px 8px 0;font:400 13px/1.6 ${F};color:#5E5069">Sent by ${escH(p.studio_name)}${p.branded ? "" : ` with <a href="https://getjovita.com" style="color:#5E5069">Jovita</a>`}. Reply to this email to reach ${escH(p.studio_name)} directly.</td></tr>
</table></td></tr></table></body></html>`;
  return { subject: "Your photos are ready ✨", html };
}

async function brevo(templateId: number | { subject: string; html: string }, to: Who, params: Record<string, unknown>, sender = FROM, replyTo?: Who, bcc?: Who) {
  const key = (env("BREVO_API_KEY") || env("BREVO"));
  if (!key) throw new Error("Email isn't set up on the server yet (missing BREVO_API_KEY).");
  const r = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": key, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ ...(typeof templateId === "number" ? { templateId, params } : { subject: templateId.subject, htmlContent: templateId.html }), to: [to], sender, ...(replyTo ? { replyTo } : {}), ...(bcc && bcc.email !== to.email ? { bcc: [bcc] } : {}) }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j?.message || `Brevo error ${r.status}`);
  return j.messageId as string;
}

// The client accepted a quote on their page (portal_accept_quote already turned it into an invoice).
// Uses the service key, so it trusts only the page token, and sends at most once per quote.
async function quoteAccepted(token: string, invoiceId: string) {
  const ok = /^[0-9a-f-]{36}$/i;
  if (!ok.test(token) || !ok.test(invoiceId)) return { error: "Bad request." };
  const key = env("SUPABASE_SERVICE_ROLE_KEY");
  const base = env("SUPABASE_URL");
  const h = { Authorization: `Bearer ${key}`, apikey: key, Accept: "application/json", "Content-Type": "application/json" };
  const get = async (path: string) => { const r = await fetch(`${base}/rest/v1/${path}`, { headers: h }); return r.ok ? await r.json() : []; };
  const [p] = await get(`projects?portal_token=eq.${token}&select=id,title,client_id,studio_id`);
  if (!p) return { error: "Not found." };
  // Claim the send first, so two clicks can't send twice
  const claim = await fetch(`${base}/rest/v1/invoices?id=eq.${invoiceId}&project_id=eq.${p.id}&kind=eq.invoice&accepted_at=not.is.null&accept_emailed_at=is.null`, {
    method: "PATCH", headers: { ...h, Prefer: "return=representation" }, body: JSON.stringify({ accept_emailed_at: new Date().toISOString() }),
  });
  const [inv] = claim.ok ? await claim.json() : [];
  if (!inv) return { ok: true, skipped: true };
  const [c] = await get(`clients?id=eq.${p.client_id}&select=name,email`);
  const [studio] = await get(`studios?id=eq.${p.studio_id}&select=*`);
  const ur = await fetch(`${base}/auth/v1/admin/users/${studio.owner_id}`, { headers: h });
  const owner = ur.ok ? await ur.json() : null;
  const ownerEmail = studio.reply_email || owner?.email || "";
  const inbox = env("INBOX_DOMAIN") && studio.inbox_code ? `inbox+${studio.inbox_code}@${env("INBOX_DOMAIN")}` : "";
  const logo = studio.logo_path && studio.plan !== "free" ? `${base}/storage/v1/object/public/studio-assets/${studio.logo_path}` : "";
  const link = `${APP_URL}/p/${token}`;
  const sent: string[] = [];
  if (c?.email) {
    await brevo(TEMPLATES.invoice, { email: c.email, name: c.name }, {
      studio_name: studio.name || "Your photographer", studio_logo: logo, client_first_name: firstName(c.name), invoice_number: inv.number,
      amount: money(inv.amount, inv.currency), due_date: day(inv.due_date) || "on receipt", project_name: p.title || inv.label || "Your session", link,
    }, { email: FROM.email, name: `${studio.name || "Your photographer"} via Jovita` }, (inbox || ownerEmail) ? { email: inbox || ownerEmail, name: studio.name } : undefined,
      studio.copy_me && ownerEmail ? { email: ownerEmail } : undefined);
    sent.push("client");
  }
  if (owner?.email) {
    await brevo(TEMPLATES.quote_accepted, { email: owner.email, name: studio.owner_first_name || undefined }, {
      client_name: c?.name || "Your client", project_name: p.title || "", amount: money(inv.amount, inv.currency), invoice_number: inv.number, link: `${APP_URL}/money`,
    });
    sent.push("studio");
  }
  await fetch(`${base}/rest/v1/events`, { method: "POST", headers: h, body: JSON.stringify({ studio_id: p.studio_id, kind: "quote_accepted", meta: { invoice_id: inv.id } }) }).catch(() => {});
  return { ok: true, sent };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Not found" }, 404);
  try {
    const body = await req.json().catch(() => ({}));
    if (body.kind === "quote_accepted") return json(await quoteAccepted(String(body.token || ""), String(body.invoice_id || "")));

    const auth = req.headers.get("Authorization") || "";
    const ur = await fetch(`${env("SUPABASE_URL")}/auth/v1/user`, { headers: { Authorization: auth, apikey: env("SUPABASE_ANON_KEY") } });
    if (!ur.ok) return json({ error: "Please sign in again." }, 401);
    const user = await ur.json();
    const get = db(auth);
    const studio = await one(get(`studios?owner_id=eq.${user.id}&select=*`), "Studio");
    if (studio.suspended) return json({ error: "This studio is paused." }, 403);

    // Your logo on client emails is a Pro and Studio feature
    const logo = studio.logo_path && studio.plan !== "free" ? `${env("SUPABASE_URL")}/storage/v1/object/public/studio-assets/${studio.logo_path}` : "";
    const studioParams = { studio_name: studio.name || "Your photographer", studio_logo: logo };
    // Client emails go out in the studio's name; replies go straight to the creative.
    const asStudio = { email: FROM.email, name: `${studio.name || "Your photographer"} via Jovita` };
    // With the Jovita inbox switched on, client replies come back into Inbox (and a copy goes to the creative)
    const inbox = env("INBOX_DOMAIN") && studio.inbox_code ? `inbox+${studio.inbox_code}@${env("INBOX_DOMAIN")}` : "";
    const replyToStudio = { email: inbox || studio.reply_email || user.email, name: studio.name || undefined };
    const me = { email: user.email as string, name: studio.owner_first_name || undefined };
    const copy = (body.copy_me ?? studio.copy_me) ? { email: studio.reply_email || user.email, name: studio.name || undefined } : undefined;

    const kind = String(body.kind || "");
    let id: string;

    if (kind === "invoice" || kind === "payment_reminder" || kind === "receipt" || kind === "quote") {
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
        paid_at: day(inv.paid_at || new Date().toISOString()), method: inv.payment_method || "—",
        balance: money(inv.status === "paid" ? 0 : Math.max(0, Number(inv.amount) - Number(inv.amount_paid || 0)), inv.currency),
      };
      id = await brevo(TEMPLATES[kind], { email: c.email, name: c.name }, params, asStudio, replyToStudio, copy);
    } else if (kind === "contract") {
      const p = await one(get(`projects?id=eq.${body.project_id}&select=*`), "Project");
      const c = await one(get(`clients?id=eq.${p.client_id}&select=name,email`), "Client");
      if (!c.email) throw new Error(`Add an email for ${c.name} first.`);
      id = await brevo(TEMPLATES.contract, { email: c.email, name: c.name },
        { ...studioParams, client_first_name: firstName(c.name), project_name: p.title || "your session", link: `${APP_URL}/p/${p.portal_token}` }, asStudio, replyToStudio, copy);
    } else if (kind === "gallery") {
      const g = await one(get(`galleries?id=eq.${body.gallery_id}&select=*`), "Gallery");
      // To one invited person (their own link, so you see when they open it), or to the gallery's client
      let to: Who, link = `${APP_URL}/g/${g.share_token}`;
      if (body.invite_id) {
        const inv = await one(get(`gallery_invites?id=eq.${body.invite_id}&gallery_id=eq.${g.id}&select=email,name,token`), "Invite");
        to = { email: inv.email, name: inv.name || undefined }; link = `${APP_URL}/g/${inv.token}`;
      } else {
        const c = await one(get(`clients?id=eq.${g.client_id}&select=name,email`), "Client");
        if (!c.email) throw new Error(`Add an email for ${c.name} first.`);
        to = { email: c.email, name: c.name };
      }
      const gp = {
        ...studioParams, client_first_name: firstName(to.name || ""), gallery_name: g.title || "Your gallery", photo_count: String(g.photo_count ?? ""),
        expires_at: g.expires_on ? day(g.expires_on) : "No expiry", link, password: String(g.settings?.password || "").trim(), branded: studio.plan !== "free" ? "1" : "",
      } as Record<string, string>;
      id = await brevo(galleryEmail(gp), to, gp, asStudio, replyToStudio, copy);
    } else if (kind === "booking") {
      const b = await one(get(`bookings?id=eq.${body.booking_id}&select=*`), "Booking");
      const c = await one(get(`clients?id=eq.${b.client_id}&select=name,email`), "Client");
      if (!c.email) throw new Error(`Add an email for ${c.name} first.`);
      const p = b.project_id ? (await get(`projects?id=eq.${b.project_id}&select=portal_token`))[0] : null;
      id = await brevo(TEMPLATES.booking, { email: c.email, name: c.name }, {
        ...studioParams, client_first_name: firstName(c.name), session_name: b.title || "Your session", date: day(b.starts_at, true),
        location: b.location || "To be confirmed", link: p ? `${APP_URL}/p/${p.portal_token}` : APP_URL,
      }, asStudio, replyToStudio, copy);
    } else if (kind === "message") {
      const c = await one(get(`clients?id=eq.${body.client_id}&select=name,email`), "Client");
      if (!c.email) throw new Error(`Add an email for ${c.name} first.`);
      const text = String(body.body || "").trim().slice(0, 4000);
      if (!text) throw new Error("Write a message first.");
      const esc = (x: string) => x.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      const html = `<div style="font:16px/1.6 -apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#261433;max-width:600px">
        ${logo ? `<img src="${logo}" width="44" height="44" alt="" style="border-radius:10px;margin-bottom:12px">` : ""}
        <div style="white-space:pre-wrap">${esc(text)}</div>
        <p style="color:#5E5069;font-size:13px;margin-top:24px">${esc(studio.name || "")} · sent with Jovita. Just reply to this email.</p></div>`;
      const key = (env("BREVO_API_KEY") || env("BREVO"));
      if (!key) throw new Error("Email isn't set up on the server yet (missing BREVO_API_KEY).");
      const r = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST", headers: { "api-key": key, "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ sender: asStudio, to: [{ email: c.email, name: c.name }], replyTo: replyToStudio, ...(copy ? { bcc: [copy] } : {}),
          subject: String(body.subject || "").slice(0, 200) || `A message from ${studio.name || "your photographer"}`, htmlContent: html, textContent: text }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.message || `Brevo error ${r.status}`);
      id = j.messageId;
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
      }, kind === "test" && ["invoice", "payment_reminder", "receipt", "contract", "gallery", "booking", "quote"].includes(body.template) ? asStudio : FROM);
    } else {
      return json({ error: "Unknown email type." }, 400);
    }
    return json({ ok: true, messageId: id });
  } catch (e) {
    console.error("send-email failed:", (e as Error).message);
    return json({ error: (e as Error).message }, 400);
  }
});
