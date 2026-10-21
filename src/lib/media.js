// Where gallery photos and videos live.
//
// Cloudflare R2 (USE_R2 = true): files are uploaded straight from the browser with a short-lived signed link from the
// "media" edge function, shown from media.getjovita.com (free downloads, cached worldwide), and downloaded with their
// original name through app.getjovita.com/dl/. Originals are stored byte for byte: nothing is resized or compressed.
// Supabase Storage (USE_R2 = false): the old way, kept until every photo has been moved across.
import { supabase } from "../supabase";

export const USE_R2 = false;
export const MEDIA_URL = import.meta.env.VITE_MEDIA_URL || "https://media.getjovita.com";
const BUCKET = "gallery-photos";
const live = () => typeof location !== "undefined" && /getjovita\.com$/.test(location.hostname);
const enc = (path) => String(path).split("/").map(encodeURIComponent).join("/");

export function mediaUrl(path) {
  if (!path) return "";
  if (USE_R2) return `${MEDIA_URL}/${enc(path)}`;
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

// A link that downloads the original with its own file name (IMG_0123.jpg)
export function mediaDownloadUrl(path, name) {
  if (!path) return "";
  if (USE_R2) return `${live() ? "" : "https://app.getjovita.com"}/dl/${enc(path)}${name ? "?name=" + encodeURIComponent(name) : ""}`;
  return mediaUrl(path) + (name ? "?download=" + encodeURIComponent(name) : "");
}

async function call(body) {
  const { data, error } = await supabase.functions.invoke("media", { body });
  if (error) {
    let msg = error.message;
    try { msg = (await error.context.json()).error || msg; } catch { /* keep message */ }
    throw new Error(msg);
  }
  if (data?.error) throw new Error(data.error);
  return data;
}

// Upload one file with live progress (bytes sent). Resolves { error }.
export async function mediaPut(path, file, contentType, onProgress) {
  if (!USE_R2) return supabasePut(path, file, contentType, onProgress);
  let url;
  try { url = (await call({ action: "sign", files: [{ path, type: contentType, size: file.size }] })).urls[0]; }
  catch (e) { return { error: e }; }
  return xhr("PUT", url, file, { "Content-Type": contentType, "Cache-Control": "public, max-age=31536000, immutable" }, file.size, onProgress);
}

// Remove files (and their preview copies, if passed). Runs in the background; failures are harmless leftovers.
export async function mediaRemove(paths) {
  const list = paths.filter(Boolean);
  for (let i = 0; i < list.length; i += 500) {
    const part = list.slice(i, i + 500);
    if (USE_R2) await call({ action: "delete", paths: part }).catch(() => {});
    else await supabase.storage.from(BUCKET).remove(part).catch(() => {});
  }
}

function xhr(method, url, body, headers, size, onProgress) {
  return new Promise((resolve) => {
    const x = new XMLHttpRequest();
    x.open(method, url);
    Object.entries(headers).forEach(([k, v]) => x.setRequestHeader(k, v));
    x.upload.onprogress = (e) => { if (e.lengthComputable) onProgress?.(e.loaded); };
    x.onload = () => {
      if (x.status >= 200 && x.status < 300) { onProgress?.(size); return resolve({ error: null }); }
      let msg = `Upload failed (${x.status})`; try { msg = JSON.parse(x.responseText).message || msg; } catch { /* keep */ }
      resolve({ error: new Error(msg) });
    };
    x.onerror = () => resolve({ error: new Error("Network problem. Check your connection and try again.") });
    x.send(body);
  });
}

async function supabasePut(path, file, contentType, onProgress) {
  const url = import.meta.env.VITE_SUPABASE_URL, key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key || typeof XMLHttpRequest === "undefined") {
    const r = await supabase.storage.from(BUCKET).upload(path, file, { contentType, cacheControl: "31536000", upsert: true });
    onProgress?.(file.size);
    return r;
  }
  const { data } = await supabase.auth.getSession();
  return xhr("POST", `${url}/storage/v1/object/${BUCKET}/${enc(path)}`, file, {
    Authorization: `Bearer ${data?.session?.access_token || key}`, apikey: key, "x-upsert": "true", "cache-control": "max-age=31536000", "Content-Type": contentType,
  }, file.size, onProgress);
}
