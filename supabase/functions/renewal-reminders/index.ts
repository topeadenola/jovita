// Renewal reminders: runs every morning (pg_cron → this function).
//
// For every studio whose Pro or Studio plan (paid or gifted) ends soon, email the owner once at each stage:
// 7 days before, 3 days before, the last day, and the day after it ends. Plans past their end date go back to Free.
// Safe to call any time: each email is sent at most once (plan_reminders), so it needs no secret.
//
// Secrets: BREVO_API_KEY (or BREVO). Provided automatically: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.

const env = (k: string) => Deno.env.get(k) ?? "";
const APP_URL = env("APP_URL") || "https://app.getjovita.com";
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "Content-Type": "application/json" } });
const esc = (v: unknown) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const PLAN: Record<string, string> = { pro: "Pro", studio: "Studio" };
const DAY = 864e5;

function email(o: { first: string; plan: string; gift: boolean; days: number; until: Date }) {
  const F = "Figtree,'Segoe UI',Helvetica,Arial,sans-serif", B = "'Bricolage Grotesque','Trebuchet MS',Arial,sans-serif";
  const date = o.until.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
  const plan = PLAN[o.plan] || "Pro";
  const ended = o.days <= 0;
  const subject = ended ? `Your Jovita ${plan} has ended` : o.days === 1 ? `Your Jovita ${plan} ends today` : `Your Jovita ${plan} ends in ${o.days} days`;
  const lead = ended
    ? `Your ${o.gift ? "free " : ""}${plan} plan ended, so your studio is on Free now. Everything you made is safe.`
    : `Your ${o.gift ? "free " : ""}${plan} plan ends on <b>${esc(date)}</b>.${o.gift ? " We hope you enjoyed it." : ""}`;
  const keep = ended
    ? `Renew to bring back your logo on client pages, ${plan === "Studio" ? "unlimited Ask Jovita, unlimited storage and RAW photos" : "300 Ask Jovita questions a month and 1 TB of storage"}.`
    : `To keep your logo on client pages, ${plan === "Studio" ? "unlimited Ask Jovita and unlimited storage" : "300 Ask Jovita questions a month and 1 TB of storage"}, renew before then. It takes a minute.`;
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;background:#F4EFFA">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4EFFA"><tr><td align="center" style="padding:32px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px"><tr><td style="padding:0 8px 18px;font:800 22px/1 ${B};color:#261433">jovita</td></tr>
<tr><td style="background:#fff;border:1px solid #E4DCEE;border-radius:22px;padding:36px 36px 28px">
<p style="margin:0 0 10px;font:800 12px/1 ${F};letter-spacing:1.6px;text-transform:uppercase;color:#8F5A00">${ended ? "Plan ended" : "Renewal reminder"}</p>
<h1 style="margin:0 0 16px;font:800 28px/1.15 ${B};color:#261433">Hi ${esc(o.first)}, ${ended ? `your ${plan} has ended` : o.days === 1 ? `your ${plan} ends today` : `${o.days} days left on ${plan}`}</h1>
<p style="margin:0 0 14px;font:400 16px/1.6 ${F};color:#261433">${lead}</p>
<p style="margin:0 0 22px;font:400 16px/1.6 ${F};color:#261433">${keep}</p>
<table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="border-radius:12px;background:#261433"><a href="${APP_URL}/settings?tab=plan" style="display:inline-block;padding:15px 26px;font:700 16px/1 ${F};color:#fff;text-decoration:none">${ended ? "Renew my plan" : `Keep ${plan}`}</a></td></tr></table>
<p style="margin:22px 0 0;font:400 14px/1.6 ${F};color:#5E5069">Questions? Just reply to this email.</p></td></tr>
<tr><td style="padding:18px 8px 0;font:400 12px/1.6 ${F};color:#5E5069">You're getting this because you have a Jovita account. Jovita · getjovita.com</td></tr></table></td></tr></table></body></html>`;
  return { subject, html };
}

// Before an automatic renewal: keep it, or change plan. Pro gets the Studio offer; Studio can step down to Pro.
export function renewEmail(o: { first: string; plan: string; cycle: string; date: Date }) {
  const F = "Figtree,'Segoe UI',Helvetica,Arial,sans-serif", B = "'Bricolage Grotesque','Trebuchet MS',Arial,sans-serif";
  const date = o.date.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
  const plan = PLAN[o.plan] || "Pro";
  const pro = o.plan === "pro";
  const every = o.cycle === "year" ? "year" : "month";
  const subject = `Your Jovita ${plan} renews on ${o.date.toLocaleDateString("en-GB", { day: "numeric", month: "long" })}`;
  const btn = (href: string, text: string, dark: boolean) => `<td style="border-radius:12px;background:${dark ? "#261433" : "#FFFFFF"};border:1px solid #261433"><a href="${href}" style="display:inline-block;padding:14px 22px;font:700 15px/1 ${F};color:${dark ? "#fff" : "#261433"};text-decoration:none">${text}</a></td>`;
  const plans = `${APP_URL}/settings?tab=plan`;
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;background:#F4EFFA">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4EFFA"><tr><td align="center" style="padding:32px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px"><tr><td style="padding:0 8px 18px;font:800 22px/1 ${B};color:#261433">jovita</td></tr>
<tr><td style="background:#fff;border:1px solid #E4DCEE;border-radius:22px;padding:36px 36px 28px">
<p style="margin:0 0 10px;font:800 12px/1 ${F};letter-spacing:1.6px;text-transform:uppercase;color:#8F5A00">Renewing soon</p>
<h1 style="margin:0 0 16px;font:800 28px/1.15 ${B};color:#261433">Hi ${esc(o.first)}, your ${plan} renews on ${esc(date)}</h1>
<p style="margin:0 0 14px;font:400 16px/1.6 ${F};color:#261433">Your ${plan} plan renews automatically for another ${every}. If you'd like to keep it, there's nothing to do.</p>
<p style="margin:0 0 22px;font:400 16px/1.6 ${F};color:#261433">${pro
    ? "Busy season coming? <b>Studio</b> gives you unlimited Ask Jovita, smarter answers for long requests, priority help and unlimited storage with RAW photos. Upgrade now and you only pay the difference."
    : "Want to spend less? You can move to <b>Pro</b> from your next payment. You keep everything in Studio until then."}</p>
<table role="presentation" cellpadding="0" cellspacing="0"><tr>${pro ? btn(plans, "Upgrade to Studio", true) : btn(plans, `Keep ${plan}`, true)}<td style="width:10px"></td>${pro ? btn(plans, "See my plan", false) : btn(plans, "Switch to Pro", false)}</tr></table>
<p style="margin:22px 0 0;font:400 14px/1.6 ${F};color:#5E5069">Want to stop? You can move to Free in Settings › Plan before ${esc(date)} and you won't be charged. Questions? Just reply to this email.</p></td></tr>
<tr><td style="padding:18px 8px 0;font:400 12px/1.6 ${F};color:#5E5069">You're getting this because you have a Jovita subscription. Jovita · getjovita.com</td></tr></table></td></tr></table></body></html>`;
  return { subject, html };
}

Deno.serve(async () => {
  const key = env("SUPABASE_SERVICE_ROLE_KEY"), base = env("SUPABASE_URL"), brevoKey = env("BREVO_API_KEY") || env("BREVO");
  const h = { Authorization: `Bearer ${key}`, apikey: key, Accept: "application/json", "Content-Type": "application/json" };
  const now = Date.now();
  const from = new Date(now - 2 * DAY).toISOString(), to = new Date(now + 11 * DAY).toISOString();
  const r = await fetch(`${base}/rest/v1/studios?select=*&plan=neq.free&plan_until=gte.${from}&plan_until=lte.${to}`, { headers: h });
  const studios = r.ok ? await r.json() : [];
  let sent = 0, ended = 0;
  for (const s of studios) {
    if (s.suspended) continue;
    if (s.plan_autorenew) {
      // Auto-renewing: one heads-up before the next payment (7 days for yearly, 3 for monthly), with the choice to switch
      if (s.plan_next) continue; // they've already chosen a change
      const renew = new Date(new Date(s.plan_until).getTime() - 3 * DAY);
      const left = Math.ceil((renew.getTime() - now) / DAY);
      const lead = s.plan_cycle === "year" ? 7 : 3;
      if (left > lead || left < 1) continue;
      const claim = await fetch(`${base}/rest/v1/plan_reminders?on_conflict=studio_id,until,stage`, { method: "POST", headers: { ...h, Prefer: "resolution=ignore-duplicates,return=representation" }, body: JSON.stringify({ studio_id: s.id, until: s.plan_until, stage: 100 }) });
      const claimed = claim.ok ? await claim.json() : [];
      if (!claimed.length || !brevoKey) continue;
      const ur = await fetch(`${base}/auth/v1/admin/users/${s.owner_id}`, { headers: h });
      const owner = ur.ok ? await ur.json() : null;
      if (!owner?.email) continue;
      const m = renewEmail({ first: String(s.owner_first_name || "there").split(" ")[0], plan: s.plan, cycle: s.plan_cycle, date: renew });
      const res = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST", headers: { "api-key": brevoKey, "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ sender: { email: "hello@getjovita.com", name: "Jovita" }, replyTo: { email: "hello@getjovita.com", name: "Jovita" }, to: [{ email: owner.email, name: s.owner_first_name || undefined }], subject: m.subject, htmlContent: m.html }),
      });
      if (res.ok) { sent++; await fetch(`${base}/rest/v1/events`, { method: "POST", headers: h, body: JSON.stringify({ studio_id: s.id, kind: "renewal_reminder", meta: { plan: s.plan, days: left, auto: true } }) }); }
      else console.error("renewal notice failed", s.id, await res.text());
      continue;
    }
    const until = new Date(s.plan_until);
    const days = Math.ceil((until.getTime() - now) / DAY);
    const stage = days <= 0 ? 0 : days <= 1 ? 1 : days <= 3 ? 3 : days <= 7 ? 7 : -1;
    if (stage < 0) continue;
    const gift = s.plan_status === "gift";
    // Past the end date: back to Free
    if (days <= 0) {
      await fetch(`${base}/rest/v1/studios?id=eq.${s.id}&plan_until=lt.${new Date(now).toISOString()}`, { method: "PATCH", headers: h, body: JSON.stringify({ plan: "free", plan_status: "active", plan_until: null }) });
      await fetch(`${base}/rest/v1/events`, { method: "POST", headers: h, body: JSON.stringify({ studio_id: s.id, kind: gift ? "gift_ended" : "plan_ended", meta: { plan: s.plan } }) });
      ended++;
    }
    // Once per stage: claim it first so a retry never sends twice
    const claim = await fetch(`${base}/rest/v1/plan_reminders?on_conflict=studio_id,until,stage`, { method: "POST", headers: { ...h, Prefer: "resolution=ignore-duplicates,return=representation" }, body: JSON.stringify({ studio_id: s.id, until: s.plan_until, stage }) });
    const claimed = claim.ok ? await claim.json() : [];
    if (!claimed.length || !brevoKey) continue;
    const ur = await fetch(`${base}/auth/v1/admin/users/${s.owner_id}`, { headers: h });
    const owner = ur.ok ? await ur.json() : null;
    if (!owner?.email) continue;
    const m = email({ first: String(s.owner_first_name || "there").split(" ")[0], plan: s.plan, gift, days, until: new Date(until.getTime() - (gift ? DAY : 0)) });
    const res = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST", headers: { "api-key": brevoKey, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ sender: { email: "hello@getjovita.com", name: "Jovita" }, replyTo: { email: "hello@getjovita.com", name: "Jovita" }, to: [{ email: owner.email, name: s.owner_first_name || undefined }], subject: m.subject, htmlContent: m.html }),
    });
    if (res.ok) {
      sent++;
      await fetch(`${base}/rest/v1/events`, { method: "POST", headers: h, body: JSON.stringify({ studio_id: s.id, kind: "renewal_reminder", meta: { plan: s.plan, days: Math.max(0, days) } }) });
    } else console.error("reminder email failed", s.id, await res.text());
  }
  return json({ ok: true, checked: studios.length, sent, ended });
});
