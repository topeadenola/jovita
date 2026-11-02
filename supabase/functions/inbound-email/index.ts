// Client emails into the Jovita Inbox.
//
// Cloudflare Email Routing sends anything addressed to inbox+<studio name or code>@getjovita.com to the jovita-mail Worker,
// which posts it here. We find the studio by <code>, match the sender to a client (or keep a new sender in the Inbox),
// and save it as an Inbox message. Nothing is sent back out.
//
// Secrets (Supabase → Edge Functions → Secrets): INBOUND_SECRET (the same value as in the jovita-mail Worker). This function never sends email.
// Deployed with verify_jwt off: the shared secret is the check.

const env = (k: string) => Deno.env.get(k) ?? "";
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "Content-Type": "application/json" } });

// Senders that are machines, not clients: we pass these to the creative but don't make them clients
const SYSTEM = /(no-?reply|mailer-daemon|postmaster|forwarding-noreply@google\.com|notifications?@|bounce)/i;
// Shops, newsletters and company mail: sent from marketing subdomains (mail.salesforce.com, newarrival.aliexpress.com,
// info.ebay.com), from big platforms, or by automated addresses. Real clients write from their own address.
const BULK_FROM = [
  /(newsletter|marketing|deals|promo|offers|news@|mailer|digest|updates@|alerts?@|billing|invoice@|receipts?@|orders?@|account@|security@|techcomms|ae-[a-z-]+\d*@)/i,
  /@(mail|email|e|em|eml|info|news|newsletter|deals|newarrival|marketing|mkt|promo|offers|notify|notification|notifications|updates|comms|send|sender|campaign|edm|crm|go|t|m|r|mg|sg|ml|reply|txn|transactional|accounts?)\d*\.[a-z0-9-]+\.[a-z.]+$/i,
  /@([a-z0-9-]+\.)*(aliexpress|ebay|amazon|amazonses|jumia|konga|temu|shein|alibaba|stripe|paypal|paystack|flutterwave|salesforce|hubspot|mailchimp|mailchimpapp|sendgrid|klaviyo|linkedin|facebookmail|instagram|meta|twitter|x|tiktok|pinterest|youtube|google|apple|microsoft|netflix|spotify|uber|bolt|airbnb|booking|canva|adobe|figma|notion|slack|zoom|dropbox|github|medium|substack|quora|upwork|fiverr|behance|magnific|freepik|envato|shopify|wix|squarespace|godaddy|namecheap|cloudflare|supabase|vercel|brevo|sendinblue)\.[a-z.]+$/i,
];
const looksBulk = (from: string) => BULK_FROM.some((r) => r.test(from));

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

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Not found" }, 404);
  const secret = env("INBOUND_SECRET");
  if (!secret || req.headers.get("x-jovita-secret") !== secret) return json({ error: "Forbidden" }, 403);
  const m = await req.json().catch(() => null);
  if (!m) return json({ error: "Bad request" }, 400);

  const code = String(m.to || "").toLowerCase().match(/\+([a-z0-9]{3,30})@/)?.[1];
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

  // inbox+<studio name>@ (new) or inbox+<random code>@ (old addresses keep working)
  let [studio] = await get(`studios?or=(inbox_name.eq.${code},inbox_code.eq.${code})&select=*&limit=1`);
  if (!studio) [studio] = await get(`studios?inbox_code=eq.${code}&select=*`);
  if (!studio) return json({ error: "Unknown address" }, 404);

  const from = String(m.from || "").toLowerCase().trim();
  const fromName = String(m.from_name || "").trim();
  const subject = String(m.subject || "").slice(0, 300);
  const text = newPart(m.text || fromHtml(m.html || "")).slice(0, 4000) || "(no text)";
  const system = SYSTEM.test(from);
  // Newsletters, shops and notifications (e.g. forwarded from Gmail): not client mail, and Gmail already has them
  if (!system && (m.bulk || looksBulk(from))) return json({ ok: true, ignored: "bulk" });
  // People you said aren't clients (Inbox › Not a client)
  const blocked: string[] = (studio.blocked_senders || []).map((x: string) => String(x).toLowerCase());
  if (from && (blocked.includes(from) || blocked.includes("@" + from.split("@")[1]))) return json({ ok: true, ignored: "blocked" });
  // Other no-reply / notification mail is skipped too; only Google's forwarding confirmation is kept
  if (system && !/forwarding-noreply@google\.com/.test(from)) return json({ ok: true, ignored: "system" });
  // Jovita's own emails coming back through Gmail forwarding: drop them, so nothing loops
  if (/@getjovita\.com$/.test(from) || /^(new email in your jovita inbox|forwarded by jovita)/i.test(text)) return json({ ok: true, ignored: "own" });

  // Same email twice (retries): ignore
  if (m.message_id) {
    const dup = await get(`messages?studio_id=eq.${studio.id}&email_id=eq.${encodeURIComponent(m.message_id)}&select=id&limit=1`);
    if (dup.length) return json({ ok: true, duplicate: true });
  }

  let client = null;
  if (!system && from) {
    [client] = await get(`clients?studio_id=eq.${studio.id}&email=ilike.${encodeURIComponent(from)}&select=id,name&limit=1`);
    // Someone new: they wait in the Inbox ("Not a client yet") until you add them, so Clients stays clean
    if (!client) {
      const row = { studio_id: studio.id, name: fromName || from.split("@")[0], email: from, phone: "", city: "", status: "inbox" };
      try { client = await post("clients", row); } catch { client = await post("clients", { ...row, status: "lead" }); } // before update 25
    }
    await post("messages", { studio_id: studio.id, client_id: client.id, channel: "email", from_client: true, read: false, body: text, subject, email_id: m.message_id || null });
  }

  // Gmail's forwarding confirmation (the code to finish setting up forwarding) goes into the Jovita Inbox, so you can read it there.
  // Nothing is ever re-sent out by email: incoming mail stays in Jovita, and Gmail already has the original.
  if (system) {
    let [g] = await get(`clients?studio_id=eq.${studio.id}&email=eq.forwarding-noreply%40google.com&select=id&limit=1`);
    if (!g) { const row = { studio_id: studio.id, name: "Gmail forwarding", email: "forwarding-noreply@google.com", phone: "", city: "", status: "inbox" }; try { g = await post("clients", row); } catch { g = await post("clients", { ...row, status: "lead" }); } }
    await post("messages", { studio_id: studio.id, client_id: g.id, channel: "email", from_client: true, read: false, body: (fromHtml(m.html || "") || m.text || "").slice(0, 4000) || "(no text)", subject, email_id: m.message_id || null });
  }
  return json({ ok: true, client_id: client?.id || null });
});
