// Jovita ⇄ Google Calendar two-way sync.
//
// One function, three doors:
//   POST {action}  + user's Authorization header  → app actions: auth_url | sync | delete_event | disconnect
//   GET  ?code&state                               → Google OAuth callback
//   POST with X-Goog-Channel-ID header             → Google push notification ("something changed")
//
// Bookings made in Jovita are written to Google. Events made in Google show up in Jovita as busy time,
// and Jovita bookings moved in Google move in Jovita too.
//
// Secrets to set (Supabase → Edge Functions → Secrets):
//   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, APP_URL (e.g. https://app.getjovita.com)
// SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY and SUPABASE_DB_URL are provided automatically.
import postgres from "npm:postgres@3.4.5";

const env = (k: string) => Deno.env.get(k) ?? "";
const CLIENT_ID = env("GOOGLE_CLIENT_ID");
const CLIENT_SECRET = env("GOOGLE_CLIENT_SECRET");
const APP_URL = env("APP_URL") || "https://app.getjovita.com";
const FN_URL = `${env("SUPABASE_URL")}/functions/v1/google-calendar`;
const SCOPE = "https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/userinfo.email openid";
const GCAL = "https://www.googleapis.com/calendar/v3";

const sql = postgres(env("SUPABASE_DB_URL"), { prepare: false, max: 2 });

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

// ---------- signed state (so the callback knows which studio it belongs to) ----------
const enc = new TextEncoder();
const keyP = crypto.subtle.importKey("raw", enc.encode(env("SUPABASE_SERVICE_ROLE_KEY")), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
const b64u = (buf: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
async function sign(text: string) { return b64u(await crypto.subtle.sign("HMAC", await keyP, enc.encode(text))); }
async function makeState(studioId: string, back: string) {
  const body = b64u(enc.encode(JSON.stringify({ s: studioId, b: back, t: Date.now() })));
  return `${body}.${await sign(body)}`;
}
async function readState(state: string) {
  const [body, sig] = state.split(".");
  if (!body || sig !== (await sign(body))) throw new Error("bad state");
  const v = JSON.parse(atob(body.replace(/-/g, "+").replace(/_/g, "/")));
  if (Date.now() - v.t > 15 * 60e3) throw new Error("expired");
  return v as { s: string; b: string };
}

// ---------- Google helpers ----------
async function accessToken(refresh: string) {
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET, refresh_token: refresh, grant_type: "refresh_token" }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(`Google sign-in expired. Reconnect Google Calendar. (${j.error})`);
  return j.access_token as string;
}
async function g(token: string, path: string, init: RequestInit = {}) {
  const r = await fetch(`${GCAL}${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers || {}) } });
  if (r.status === 204) return null;
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error(j?.error?.message || `Google ${r.status}`) as Error & { status: number }; e.status = r.status; throw e; }
  return j;
}

// ---------- the sync itself ----------
async function pushBookings(studioId: string, token: string, cal: string) {
  const rows = await sql`
    select b.id, b.title, b.starts_at, b.ends_at, b.location, b.google_event_id, c.name as client_name
    from public.bookings b join public.clients c on c.id = b.client_id
    where b.studio_id = ${studioId}
      and (b.google_event_id is null or b.google_synced_at is null or b.updated_at > b.google_synced_at)
      and b.starts_at > now() - interval '30 days'`;
  for (const b of rows) {
    const end = b.ends_at ?? new Date(new Date(b.starts_at).getTime() + 60 * 60e3);
    const event = {
      summary: `${b.title} · ${b.client_name}`,
      location: b.location || undefined,
      description: "Booked in Jovita",
      start: { dateTime: new Date(b.starts_at).toISOString() },
      end: { dateTime: new Date(end).toISOString() },
      extendedProperties: { private: { jovita_booking_id: b.id } },
    };
    let id = b.google_event_id as string | null;
    try {
      if (id) await g(token, `/calendars/${encodeURIComponent(cal)}/events/${id}`, { method: "PATCH", body: JSON.stringify(event) });
      else id = (await g(token, `/calendars/${encodeURIComponent(cal)}/events`, { method: "POST", body: JSON.stringify(event) })).id;
    } catch (e) {
      if ((e as { status?: number }).status === 404 || (e as { status?: number }).status === 410) {
        id = (await g(token, `/calendars/${encodeURIComponent(cal)}/events`, { method: "POST", body: JSON.stringify(event) })).id;
      } else throw e;
    }
    await sql`update public.bookings set google_event_id = ${id}, google_synced_at = now() where id = ${b.id}`;
  }
  return rows.length;
}

async function pullEvents(studioId: string, token: string, cal: string, syncToken: string | null): Promise<number> {
  let page: string | undefined, next: string | undefined, n = 0;
  do {
    const q = new URLSearchParams({ singleEvents: "true", showDeleted: "true", maxResults: "250" });
    if (syncToken) q.set("syncToken", syncToken);
    else q.set("timeMin", new Date(Date.now() - 30 * 864e5).toISOString());
    if (page) q.set("pageToken", page);
    let res;
    try { res = await g(token, `/calendars/${encodeURIComponent(cal)}/events?${q}`); }
    catch (e) {
      if ((e as { status?: number }).status === 410 && syncToken) { // token too old: start over
        await sql`delete from public.calendar_busy where studio_id = ${studioId}`;
        return pullEvents(studioId, token, cal, null);
      }
      throw e;
    }
    for (const ev of res.items || []) {
      n++;
      const bookingId = ev.extendedProperties?.private?.jovita_booking_id;
      const cancelled = ev.status === "cancelled";
      if (bookingId) {
        // A Jovita booking moved or renamed in Google: follow it. Deleted in Google: just unlink, never lose the booking.
        if (cancelled) await sql`update public.bookings set google_event_id = null, google_synced_at = now() where id = ${bookingId} and studio_id = ${studioId}`;
        else if (ev.start?.dateTime) {
          await sql`update public.bookings set starts_at = ${ev.start.dateTime}, ends_at = ${ev.end?.dateTime ?? null},
            location = coalesce(${ev.location ?? null}, location), google_synced_at = now()
            where id = ${bookingId} and studio_id = ${studioId} and (starts_at <> ${ev.start.dateTime}::timestamptz or ends_at is distinct from ${ev.end?.dateTime ?? null}::timestamptz)`;
        }
        continue;
      }
      if (cancelled) { await sql`delete from public.calendar_busy where studio_id = ${studioId} and google_event_id = ${ev.id}`; continue; }
      const allDay = !ev.start?.dateTime;
      const start = ev.start?.dateTime ?? `${ev.start?.date}T00:00:00Z`;
      const end = ev.end?.dateTime ?? `${ev.end?.date}T00:00:00Z`;
      if (!ev.start) continue;
      await sql`insert into public.calendar_busy (studio_id, google_event_id, title, starts_at, ends_at, all_day)
        values (${studioId}, ${ev.id}, ${(ev.summary || "Busy").slice(0, 200)}, ${start}, ${end}, ${allDay})
        on conflict (studio_id, google_event_id) do update set title = excluded.title, starts_at = excluded.starts_at, ends_at = excluded.ends_at, all_day = excluded.all_day`;
    }
    page = res.nextPageToken;
    next = res.nextSyncToken ?? next;
  } while (page);
  if (next) await sql`update private.google_tokens set sync_token = ${next}, updated_at = now() where studio_id = ${studioId}`;
  return n;
}

async function ensureWatch(studioId: string, token: string, cal: string, t: Record<string, unknown>) {
  const exp = t.channel_expires_at ? new Date(t.channel_expires_at as string).getTime() : 0;
  if (exp - Date.now() > 2 * 864e5) return;
  if (t.channel_id && t.resource_id) {
    await g(token, "/channels/stop", { method: "POST", body: JSON.stringify({ id: t.channel_id, resourceId: t.resource_id }) }).catch(() => {});
  }
  const id = crypto.randomUUID();
  const r = await g(token, `/calendars/${encodeURIComponent(cal)}/events/watch`, {
    method: "POST",
    body: JSON.stringify({ id, type: "web_hook", address: FN_URL, token: await sign(id), params: { ttl: String(7 * 86400) } }),
  });
  await sql`update private.google_tokens set channel_id = ${id}, resource_id = ${r.resourceId},
    channel_expires_at = to_timestamp(${Number(r.expiration) / 1000}) where studio_id = ${studioId}`;
}

async function syncStudio(studioId: string) {
  const [t] = await sql`select * from private.google_tokens where studio_id = ${studioId}`;
  const [c] = await sql`select calendar_id from public.calendar_connections where studio_id = ${studioId}`;
  if (!t || !c) throw new Error("Google Calendar isn't connected.");
  try {
    const token = await accessToken(t.refresh_token);
    const pushed = await pushBookings(studioId, token, c.calendar_id);
    const pulled = await pullEvents(studioId, token, c.calendar_id, t.sync_token);
    await ensureWatch(studioId, token, c.calendar_id, t).catch((e) => console.error("watch", e.message)); // needs a public HTTPS URL; fine to skip
    await sql`update public.calendar_connections set last_synced_at = now(), last_error = null where studio_id = ${studioId}`;
    return { pushed, pulled };
  } catch (e) {
    await sql`update public.calendar_connections set last_error = ${(e as Error).message} where studio_id = ${studioId}`;
    throw e;
  }
}

// ---------- doors ----------
async function studioFromRequest(req: Request) {
  const auth = req.headers.get("Authorization") || "";
  const r = await fetch(`${env("SUPABASE_URL")}/auth/v1/user`, { headers: { Authorization: auth, apikey: env("SUPABASE_ANON_KEY") } });
  if (!r.ok) throw new Error("Please sign in again.");
  const u = await r.json();
  const [s] = await sql`select id from public.studios where owner_id = ${u.id}`;
  if (!s) throw new Error("No studio found for this account.");
  return s.id as string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const url = new URL(req.url);

  // 1. Google push notification
  const channel = req.headers.get("X-Goog-Channel-ID");
  if (channel) {
    if (req.headers.get("X-Goog-Channel-Token") !== (await sign(channel))) return new Response("no", { status: 403 });
    const [t] = await sql`select studio_id from private.google_tokens where channel_id = ${channel}`;
    if (t && req.headers.get("X-Goog-Resource-State") !== "sync") {
      // @ts-ignore EdgeRuntime is provided by Supabase
      EdgeRuntime.waitUntil(syncStudio(t.studio_id).catch((e) => console.error("push sync", e.message)));
    }
    return new Response("ok");
  }

  // 2. OAuth callback from Google
  if (req.method === "GET" && (url.searchParams.has("code") || url.searchParams.has("error"))) {
    let back = `${APP_URL}/bookings`;
    try {
      const st = await readState(url.searchParams.get("state") || "");
      back = st.b === "app" ? "jovita://bookings" : `${APP_URL}/bookings`;
      if (url.searchParams.get("error")) throw new Error(url.searchParams.get("error")!);
      const r = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ code: url.searchParams.get("code")!, client_id: CLIENT_ID, client_secret: CLIENT_SECRET, redirect_uri: FN_URL, grant_type: "authorization_code" }),
      });
      const tok = await r.json();
      if (!r.ok || !tok.refresh_token) throw new Error(tok.error_description || "Google didn't return access. Try again.");
      const who = await (await fetch("https://www.googleapis.com/oauth2/v3/userinfo", { headers: { Authorization: `Bearer ${tok.access_token}` } })).json();
      await sql`insert into private.google_tokens (studio_id, refresh_token) values (${st.s}, ${tok.refresh_token})
        on conflict (studio_id) do update set refresh_token = excluded.refresh_token, sync_token = null, updated_at = now()`;
      await sql`insert into public.calendar_connections (studio_id, google_email) values (${st.s}, ${who.email || ""})
        on conflict (studio_id) do update set google_email = excluded.google_email, last_error = null`;
      await sql`update public.bookings set google_synced_at = null where studio_id = ${st.s}`;
      await syncStudio(st.s).catch((e) => console.error("first sync", e.message));
      return Response.redirect(`${back}?google=connected`, 302);
    } catch (e) {
      return Response.redirect(`${back}?google=failed&reason=${encodeURIComponent((e as Error).message)}`, 302);
    }
  }

  // 3. App actions
  if (req.method !== "POST") return json({ error: "Not found" }, 404);
  try {
    const studioId = await studioFromRequest(req);
    const { action, google_event_id, from } = await req.json().catch(() => ({}));
    if (!CLIENT_ID || !CLIENT_SECRET) return json({ error: "Google Calendar isn't set up on the server yet (missing Google keys)." }, 400);

    if (action === "auth_url") {
      const q = new URLSearchParams({
        client_id: CLIENT_ID, redirect_uri: FN_URL, response_type: "code", scope: SCOPE,
        access_type: "offline", prompt: "consent", include_granted_scopes: "true",
        state: await makeState(studioId, from === "app" ? "app" : "web"),
      });
      return json({ url: `https://accounts.google.com/o/oauth2/v2/auth?${q}` });
    }
    if (action === "sync") return json(await syncStudio(studioId));
    if (action === "delete_event") {
      const [t] = await sql`select refresh_token from private.google_tokens where studio_id = ${studioId}`;
      const [c] = await sql`select calendar_id from public.calendar_connections where studio_id = ${studioId}`;
      if (t && c && google_event_id) {
        const token = await accessToken(t.refresh_token);
        await g(token, `/calendars/${encodeURIComponent(c.calendar_id)}/events/${encodeURIComponent(google_event_id)}`, { method: "DELETE" }).catch(() => {});
      }
      return json({ ok: true });
    }
    if (action === "disconnect") {
      const [t] = await sql`select * from private.google_tokens where studio_id = ${studioId}`;
      if (t) {
        const token = await accessToken(t.refresh_token).catch(() => null);
        if (token && t.channel_id) await g(token, "/channels/stop", { method: "POST", body: JSON.stringify({ id: t.channel_id, resourceId: t.resource_id }) }).catch(() => {});
        await fetch(`https://oauth2.googleapis.com/revoke?token=${t.refresh_token}`, { method: "POST" }).catch(() => {});
      }
      await sql`delete from private.google_tokens where studio_id = ${studioId}`;
      await sql`delete from public.calendar_connections where studio_id = ${studioId}`;
      await sql`delete from public.calendar_busy where studio_id = ${studioId}`;
      await sql`update public.bookings set google_event_id = null, google_synced_at = null where studio_id = ${studioId}`;
      return json({ ok: true });
    }
    return json({ error: "Unknown action" }, 400);
  } catch (e) {
    return json({ error: (e as Error).message }, 400);
  }
});
