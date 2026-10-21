// Gallery files on Cloudflare R2.
//
// POST { action: "sign", files: [{ path, type, size }] } → { urls } short-lived links the browser uploads to directly.
//      Only paths inside the signed-in studio's own folder, and only while there's room in their plan.
// POST { action: "delete", paths } → removes the studio's own files.
// POST { action: "check" } → HQ only: is the R2 connection working? { ok, error }
// POST { action: "migrate", after } → HQ only: copies the next batch of files from Supabase Storage to R2.
//      { copied, failed, error, next, done, total } — call again with next until done.
// POST { action: "cleanup", after } → HQ only: deletes Supabase copies that are safely in R2 (same size), to free space.
//      { removed, kept, next, done, total }
//
// Files are stored exactly as uploaded: nothing is resized or compressed.
// Secrets: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY. Optional: R2_BUCKET (default jovita-media).
// Provided automatically: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY.

import { AwsClient } from "npm:aws4fetch@1.0.20";

const env = (k: string) => Deno.env.get(k) ?? "";
const BUCKET = env("R2_BUCKET") || "jovita-media";
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });
const enc = (p: string) => p.split("/").map(encodeURIComponent).join("/");
const r2 = () => new AwsClient({ accessKeyId: env("R2_ACCESS_KEY_ID"), secretAccessKey: env("R2_SECRET_ACCESS_KEY"), service: "s3", region: "auto" });
const objUrl = (p: string) => `https://${env("R2_ACCOUNT_ID")}.r2.cloudflarestorage.com/${BUCKET}/${enc(p)}`;
const MB = 1024 * 1024;
const fmt = (b: number) => (b >= 1024 ** 3 ? (b / 1024 ** 3).toFixed(1) + " GB" : Math.round(b / MB) + " MB");

async function pool<T>(items: T[], size: number, fn: (x: T) => Promise<unknown>) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, async () => { while (i < items.length) await fn(items[i++]); }));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  if (!env("R2_ACCESS_KEY_ID") || !env("R2_ACCOUNT_ID")) return json({ error: "Photo storage isn't set up yet" }, 503);
  const base = env("SUPABASE_URL"), sk = env("SUPABASE_SERVICE_ROLE_KEY");
  const svc = { Authorization: `Bearer ${sk}`, apikey: sk, "Content-Type": "application/json" };
  const auth = req.headers.get("Authorization") || "";

  const ur = await fetch(`${base}/auth/v1/user`, { headers: { Authorization: auth, apikey: env("SUPABASE_ANON_KEY") } });
  if (!ur.ok) return json({ error: "Please sign in again" }, 401);
  const user = await ur.json();

  let body: { action?: string; files?: { path: string; type?: string; size?: number }[]; paths?: string[]; after?: string } = {};
  try { body = await req.json(); } catch { /* empty */ }
  const aws = r2();

  // Errors without hostnames or keys in them, so nothing secret reaches the browser
  const why = (e: unknown) => String((e as Error)?.message || e).replace(/https?:\/\/\S+/g, "the R2 address").slice(0, 200);
  const admin = async () => {
    const ar = await fetch(`${base}/rest/v1/rpc/is_admin`, { method: "POST", headers: { Authorization: auth, apikey: env("SUPABASE_ANON_KEY"), "Content-Type": "application/json" }, body: "{}" });
    return ar.ok && (await ar.json()) === true;
  };

  if (body.action === "check") {
    if (!(await admin())) return json({ error: "Admins only" }, 403);
    if (!/^[0-9a-f]{32}$/i.test(env("R2_ACCOUNT_ID"))) return json({ ok: false, error: "R2_ACCOUNT_ID should be the 32-letter Account ID from the R2 overview page (letters a–f and numbers)." });
    try {
      const r = await aws.fetch(`https://${env("R2_ACCOUNT_ID")}.r2.cloudflarestorage.com/${BUCKET}?list-type=2&max-keys=1`);
      if (r.status === 403) return json({ ok: false, error: "R2 refused the keys. Check R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY, and that the token can read and write jovita-media." });
      if (r.status === 404) return json({ ok: false, error: "No bucket called jovita-media in this account." });
      return json({ ok: r.ok, error: r.ok ? null : `R2 said ${r.status}` });
    } catch (e) { return json({ ok: false, error: why(e) }); }
  }

  // HQ: delete Supabase copies of files that are already in R2 (checked one by one, same size), to free space
  if (body.action === "cleanup") {
    if (!(await admin())) return json({ error: "Admins only" }, 403);
    const lr = await fetch(`${base}/rest/v1/rpc/admin_media_list`, { method: "POST", headers: svc, body: JSON.stringify({ p_after: body.after || "", p_n: 100 }) });
    if (!lr.ok) return json({ error: "Run update 20 in Supabase first" }, 500);
    const rows: { name: string; size: number; total: number }[] = await lr.json();
    const safe: string[] = [];
    let kept = 0;
    await pool(rows, 8, async (o) => {
      try {
        const h = await aws.fetch(objUrl(o.name), { method: "HEAD" });
        if (h.ok && Number(h.headers.get("content-length")) === Number(o.size)) safe.push(o.name); else kept++;
      } catch { kept++; }
    });
    if (safe.length) {
      const d = await fetch(`${base}/storage/v1/object/gallery-photos`, { method: "DELETE", headers: svc, body: JSON.stringify({ prefixes: safe }) });
      if (!d.ok) return json({ error: `Supabase wouldn't delete: ${d.status}` }, 502);
    }
    // Deleted names drop out of the list, so carry on after the last one we kept
    const next = rows.length ? rows[rows.length - 1].name : body.after || "";
    return json({ removed: safe.length, kept, next, done: rows.length < 100, total: rows[0]?.total ?? 0 });
  }

  // HQ: copy existing photos from Supabase Storage to R2, a batch at a time
  if (body.action === "migrate") {
    if (!(await admin())) return json({ error: "Admins only" }, 403);
    const lr = await fetch(`${base}/rest/v1/rpc/admin_media_list`, { method: "POST", headers: svc, body: JSON.stringify({ p_after: body.after || "", p_n: 25 }) });
    if (!lr.ok) return json({ error: "Run update 20 in Supabase first" }, 500);
    const rows: { name: string; size: number; mimetype: string; total: number }[] = await lr.json();
    let copied = 0, failed = 0, error = "";
    await pool(rows, 4, async (o) => {
      try {
        const src = await fetch(`${base}/storage/v1/object/gallery-photos/${enc(o.name)}`, { headers: { Authorization: `Bearer ${sk}`, apikey: sk } });
        if (!src.ok) throw new Error(`read ${src.status}`);
        const data = await src.arrayBuffer();
        const put = await aws.fetch(objUrl(o.name), { method: "PUT", body: data, headers: { "Content-Type": o.mimetype, "Cache-Control": "public, max-age=31536000, immutable" } });
        if (!put.ok) throw new Error(`write ${put.status}`);
        copied++;
      } catch (e) { failed++; error = error || why(e); console.error("migrate", o.name, why(e)); }
    });
    const next = rows.length ? rows[rows.length - 1].name : body.after || "";
    return json({ copied, failed, error, next, done: rows.length < 25, total: rows[0]?.total ?? 0 });
  }

  // Everyone else acts only inside their own studio's folder
  const sr = await fetch(`${base}/rest/v1/studios?select=id&owner_id=eq.${user.id}&limit=1`, { headers: svc });
  const studio = sr.ok ? (await sr.json())[0] : null;
  if (!studio) return json({ error: "No studio found for this account" }, 404);
  const mine = (p: unknown) => typeof p === "string" && p.startsWith(studio.id + "/") && !p.includes("..") && p.length < 400;

  if (body.action === "sign") {
    const files = (body.files || []).slice(0, 50);
    if (!files.length || !files.every((f) => mine(f.path))) return json({ error: "Not allowed" }, 403);
    const qr = await fetch(`${base}/rest/v1/rpc/storage_quota_for`, { method: "POST", headers: svc, body: JSON.stringify({ p_studio: studio.id }) });
    const q = qr.ok ? await qr.json() : null;
    const size = files.reduce((n, f) => n + Math.max(0, Number(f.size) || 0), 0);
    const perFile = q?.plan === "free" ? 50 * MB : 2048 * MB;
    if (files.some((f) => (Number(f.size) || 0) > perFile)) return json({ error: `Files on your plan can be up to ${fmt(perFile)} each.` }, 413);
    if (q && q.limit != null && Number(q.used) + size > Number(q.limit)) return json({ error: `Not enough storage: ${fmt(Number(q.used))} of ${fmt(Number(q.limit))} used.` }, 413);
    const urls = await Promise.all(files.map(async (f) => {
      const u = new URL(objUrl(f.path));
      u.searchParams.set("X-Amz-Expires", "3600");
      const signed = await aws.sign(new Request(u, { method: "PUT" }), { aws: { signQuery: true } });
      return signed.url;
    }));
    return json({ urls });
  }

  if (body.action === "delete") {
    const paths = (body.paths || []).filter(mine).slice(0, 1000);
    let removed = 0;
    await pool(paths, 10, async (p) => { const r = await aws.fetch(objUrl(p), { method: "DELETE" }); if (r.ok || r.status === 404) removed++; });
    return json({ removed });
  }

  return json({ error: "Unknown action" }, 400);
});
