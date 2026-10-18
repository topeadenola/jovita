// Client emails into the Jovita Inbox.
//
// Cloudflare Email Routing sends anything addressed to inbox+<code>@getjovita.com to the jovita-mail Worker,
// which posts it here. We find the studio by <code>, match the sender to a client (or add them as a new lead),
// save it as an Inbox message, and send the creative a copy so nothing is missed.
//
// Secrets (Supabase → Edge Functions → Secrets): INBOUND_SECRET (the same value as in the jovita-mail Worker), BREVO_API_KEY.
// Deployed with verify_jwt off: the shared secret is the check.

const env = (k: string) => Deno.env.get(k) ?? "";
const APP_URL = env("APP_URL") || "https://app.getjovita.com";
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "Content-Type": "application/json" } });

// Senders that are machines, not clients: we pass these to the creative but don't make them clients
const SYSTEM = /(no-?reply|mailer-daemon|postmaster|forwarding-noreply@google\.com|notifications?@|bounce)/i;

// Keep only the new part of a reply (drop "On Tue, X wrote:" and quoted lines)
function newPart(text: string) {
  const lines = (text || "").replace(/\r/g, "").split("\n");
  const out: string[] = [];
  for (const l of lines) {
    if (/^\s*>/.test(l)) break;
    if (/^On .+wrote:\s*$/i.test(l) || /^Le .+a écrit\s*:/i.test(l) || /^-{2,}\s*Original Message/i.test(l) || /^From: .+/i.test(l) && out.length > 2) break;
    out.push(l);
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim() || (text || "").trim();
}
const fromHtml = (h: string) => h.replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<br\s*\/?>/gi, "\n").replace(/<\/p>/gi, "\n\n").replace(/<[^>]+>/g, "")
  .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#39;/g, "'").replace(/&quot;/g, '"');
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Not found" }, 404);
  const secret = env("INBOUND_SECRET");
  if (!secret || req.headers.get("x-jovita-secret") !== secret) return json({ error: "Forbidden" }, 403);
  const m = await req.json().catch(() => null);
  if (!m) return json({ error: "Bad request" }, 400);

  const code = String(m.to || "").toLowerCase().match(/\+([a-z0-9]{6,20})@/)?.[1];
  if (!code) return json({ error: "Unknown address" }, 404);

  const key = env("SUPABASE_SERVICE_ROLE_KEY"), base = env("SUPABASE_URL");
  const h = { Authorization: `Bearer ${key}`, apikey: key, Accept: "application/json", "Content-Type": "application/json" };
  const get = async (path: string) => { const r = await fetch(`${base}/rest/v1/${path}`, { headers: h }); return r.ok ? await r.json() : []; };
  const post = async (table: string, row: unknown) => {
    const r = await fetch(`${base}/rest/v1/${table}`, { method: "POST", headers: { ...h, Prefer: "return=representation" }, body: JSON.stringify(row) });
    const j = await r.json().catch(() => []);
    if (!r.ok) throw new Error(j?.message || `Couldn't save to ${table}`);
    return j[0];
  };

  const [studio] = await get(`studios?inbox_code=eq.${code}&select=*`);
  if (!studio) return json({ error: "Unknown address" }, 404);

  const from = String(m.from || "").toLowerCase().trim();
  const fromName = String(m.from_name || "").trim();
  const subject = String(m.subject || "").slice(0, 300);
  const text = newPart(m.text || fromHtml(m.html || "")).slice(0, 4000) || "(no text)";
  const system = SYSTEM.test(from);

  // Same email twice (retries): ignore
  if (m.message_id) {
    const dup = await get(`messages?studio_id=eq.${studio.id}&email_id=eq.${encodeURIComponent(m.message_id)}&select=id&limit=1`);
    if (dup.length) return json({ ok: true, duplicate: true });
  }

  let client = null;
  if (!system && from) {
    [client] = await get(`clients?studio_id=eq.${studio.id}&email=ilike.${encodeURIComponent(from)}&select=id,name&limit=1`);
    if (!client) client = await post("clients", { studio_id: studio.id, name: fromName || from.split("@")[0], email: from, phone: "", city: "", status: "lead" });
    await post("messages", { studio_id: studio.id, client_id: client.id, channel: "email", from_client: true, read: false, body: text, subject, email_id: m.message_id || null });
  }

  // A copy to the creative's own inbox (always for system mail, e.g. Gmail's forwarding confirmation)
  if (studio.forward_inbox !== false || system) {
    const ur = await fetch(`${base}/auth/v1/admin/users/${studio.owner_id}`, { headers: h });
    const owner = ur.ok ? await ur.json() : null;
    const to = studio.reply_email || owner?.email;
    const apiKey = env("BREVO_API_KEY");
    if (to && apiKey) {
      const who = fromName ? `${fromName} <${from}>` : from;
      const html = `<div style="font:15px/1.6 -apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#261433;max-width:600px">
        <p style="color:#5E5069;margin:0 0 12px">${system ? "Forwarded by Jovita" : `New email in your Jovita inbox from <b>${esc(who)}</b>`}</p>
        <div style="white-space:pre-wrap;background:#F4EFFA;border-radius:14px;padding:16px">${esc(system ? fromHtml(m.html || "") || m.text || "" : text)}</div>
        ${system ? "" : `<p style="margin:16px 0"><a href="${APP_URL}/inbox" style="background:#261433;color:#fff;padding:12px 20px;border-radius:12px;text-decoration:none;font-weight:700">Reply in Jovita</a></p>
        <p style="color:#5E5069;font-size:13px">Or just reply to this email to answer ${esc(fromName || from)} directly.</p>`}</div>`;
      await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST", headers: { "api-key": apiKey, "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          sender: { email: "hello@getjovita.com", name: "Jovita inbox" }, to: [{ email: to }],
          ...(system ? {} : { replyTo: { email: from, name: fromName || undefined } }),
          subject: system ? subject : `${fromName || from}: ${subject || "New message"}`, htmlContent: html,
        }),
      }).catch(() => {});
    }
  }
  return json({ ok: true, client_id: client?.id || null });
});
