// app.getjovita.com: the Jovita app (static files) plus one route, /dl/<file>?name=IMG_0123.jpg,
// which downloads a gallery original from Cloudflare R2 with its own file name. Everything else is the app.
// Only /dl/* runs this script (run_worker_first in wrangler.jsonc); app pages are served as plain files.
export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (!url.pathname.startsWith("/dl/")) return env.ASSETS.fetch(req);
    if (req.method !== "GET" && req.method !== "HEAD") return new Response("Method not allowed", { status: 405 });
    const key = url.pathname.slice(4).split("/").map(decodeURIComponent).join("/");
    if (!key || key.includes("..")) return new Response("Not found", { status: 404 });
    const obj = await env.MEDIA.get(key, { range: req.headers });
    if (!obj) return new Response("Not found", { status: 404 });
    const headers = new Headers();
    obj.writeHttpMetadata(headers);
    headers.set("etag", obj.httpEtag);
    headers.set("accept-ranges", "bytes");
    headers.set("cache-control", "private, max-age=3600");
    const name = (url.searchParams.get("name") || key.split("/").pop()).replace(/["\\\r\n]/g, "");
    headers.set("content-disposition", `attachment; filename="${name.replace(/[^\x20-\x7e]/g, "_")}"; filename*=UTF-8''${encodeURIComponent(name)}`);
    let status = 200;
    if (obj.range && req.headers.has("range")) {
      const { offset = 0, length = obj.size - offset } = obj.range;
      headers.set("content-range", `bytes ${offset}-${offset + length - 1}/${obj.size}`);
      headers.set("content-length", String(length));
      status = 206;
    } else headers.set("content-length", String(obj.size));
    return new Response(req.method === "HEAD" ? null : obj.body, { status, headers });
  },
};
