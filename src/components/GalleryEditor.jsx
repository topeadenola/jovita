import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../supabase";
import { useData } from "../lib/data";
import { SaveState, useAutosave } from "../lib/autosave";
import { addDays, fdate } from "../lib/format";
import { tx, txn } from "../lib/i18n";
import { Toggle, useToast } from "./ui";
import Icon from "./Icon";
import GalleryShare, { galleryLink } from "./GalleryShare";
import { sendEmail } from "../lib/email";
import { useUi } from "./Shell";

const BUCKET = "gallery-photos";
const uid = () => Math.random().toString(36).slice(2, 9);
export const publicUrl = (path) => (path ? supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl : "");
// Every upload also gets a light 1200px copy (name.thumb.jpg) so grids load fast; originals are kept for downloads
export const RAW_EXT = ["cr2", "cr3", "nef", "arw", "dng", "raf", "rw2", "orf", "srw", "pef"];
export const isRaw = (path) => RAW_EXT.includes(String(path || "").split(".").pop().toLowerCase());
export const VIDEO_EXT = ["mp4", "mov", "m4v", "webm"];
export const isVideo = (path) => VIDEO_EXT.includes(String(path || "").split(".").pop().toLowerCase());
// Download with the original file name (IMG_0123.jpg), not the storage name
export const downloadUrl = (path, name) => (path ? publicUrl(path) + (name ? "?download=" + encodeURIComponent(name) : "") : "");
export const thumbPath = (path) => String(path || "").replace(/\.[^./]+$/, ".thumb.jpg");
export const thumbUrl = (path) => (path ? publicUrl(thumbPath(path)) : "");
// <Thumb> shows the light copy, and falls back to the original for photos uploaded before thumbnails existed
export function Thumb({ path, alt = "", thumb, ...rest }) {
  // thumb === false: no preview copy yet, so go straight to the original instead of waiting for a miss
  const first = thumb === false && !isRaw(path) && !isVideo(path) ? publicUrl(path) : thumbUrl(path);
  const [src, setSrc] = useState(first);
  const [broken, setBroken] = useState(false);
  useEffect(() => { setSrc(first); setBroken(false); }, [path, first]);
  if (isRaw(path) && src === publicUrl(path)) return <span className="raw-tile" aria-label={alt}>RAW<small>.{String(path).split(".").pop().toUpperCase()}</small></span>;
  if (isVideo(path)) {
    // Videos show their first frame (saved at upload) with a play mark
    const { style, onClick, className = "" } = rest;
    return (
      <span className={`thumb-vid ${className}`} style={style} onClick={onClick} role={onClick ? "button" : undefined} aria-label={alt}>
        {!broken ? <img src={thumbUrl(path)} alt={alt} loading="lazy" decoding="async" onLoad={(e) => e.currentTarget.classList.add("in")} onError={() => setBroken(true)} /> : <span className="vid-blank" />}
        <i className="vid-play" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z" fill="currentColor" /></svg></i>
      </span>
    );
  }
  return <img src={src} alt={alt} loading="lazy" decoding="async" onLoad={(e) => e.currentTarget.classList.add("in")} onError={() => { if (src !== publicUrl(path)) setSrc(publicUrl(path)); }} {...rest} />;
}
// Upload with live progress (bytes sent), straight to Supabase Storage
async function putWithProgress(path, file, contentType, onProgress) {
  const url = import.meta.env.VITE_SUPABASE_URL, key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key || typeof XMLHttpRequest === "undefined") {
    const r = await supabase.storage.from(BUCKET).upload(path, file, { contentType, cacheControl: "31536000" });
    onProgress?.(file.size);
    return r;
  }
  const { data } = await supabase.auth.getSession();
  return new Promise((resolve) => {
    const x = new XMLHttpRequest();
    x.open("POST", `${url}/storage/v1/object/${BUCKET}/${path.split("/").map(encodeURIComponent).join("/")}`);
    x.setRequestHeader("Authorization", `Bearer ${data?.session?.access_token || key}`);
    x.setRequestHeader("apikey", key);
    x.setRequestHeader("x-upsert", "false");
    x.setRequestHeader("cache-control", "max-age=31536000");
    x.setRequestHeader("Content-Type", contentType);
    x.upload.onprogress = (e) => { if (e.lengthComputable) onProgress?.(e.loaded); };
    x.onload = () => {
      if (x.status >= 200 && x.status < 300) { onProgress?.(file.size); return resolve({ error: null }); }
      let msg = `Upload failed (${x.status})`; try { msg = JSON.parse(x.responseText).message || msg; } catch { /* keep */ }
      resolve({ error: new Error(msg) });
    };
    x.onerror = () => resolve({ error: new Error("Network problem. Check your connection and try again.") });
    x.send(file);
  });
}
// First frame of a video, as a small JPG for grids
async function makeVideoThumb(file, max = 1200) {
  const url = URL.createObjectURL(file);
  try {
    const v = document.createElement("video");
    v.muted = true; v.playsInline = true; v.preload = "auto"; v.src = url;
    await new Promise((ok, bad) => { v.onloadeddata = ok; v.onerror = bad; setTimeout(bad, 15000); });
    v.currentTime = Math.min(1, (v.duration || 2) / 4);
    await new Promise((ok) => { v.onseeked = ok; setTimeout(ok, 4000); });
    const scale = Math.min(1, max / Math.max(v.videoWidth, v.videoHeight));
    const w = Math.round(v.videoWidth * scale), h = Math.round(v.videoHeight * scale);
    if (!w || !h) return {};
    const c = document.createElement("canvas"); c.width = w; c.height = h;
    c.getContext("2d").drawImage(v, 0, 0, w, h);
    const blob = await new Promise((ok) => c.toBlob(ok, "image/jpeg", 0.82));
    return { blob, width: v.videoWidth, height: v.videoHeight };
  } catch { return {}; } finally { URL.revokeObjectURL(url); }
}
async function makeThumb(file, max = 1200) {
  try {
    const probe = await createImageBitmap(file);
    const scale = Math.min(1, max / Math.max(probe.width, probe.height));
    const w = Math.round(probe.width * scale), h = Math.round(probe.height * scale);
    const c = document.createElement("canvas"); c.width = w; c.height = h;
    c.getContext("2d").drawImage(probe, 0, 0, w, h);
    const dims = { width: probe.width, height: probe.height };
    probe.close?.();
    const blob = await new Promise((r) => c.toBlob(r, "image/jpeg", 0.82));
    return { blob, ...dims };
  } catch { return { blob: null, width: null, height: null }; } // HEIC/RAW may not decode in the browser
}
const fmtBytes = (n) => (n >= 1024 ** 3 ? (n / 1024 ** 3).toFixed(1) + " GB" : Math.max(1, Math.round(n / 1024 ** 2)) + " MB");

export const COVERS = [
  ["center", "Centre"], ["left", "Left"], ["novel", "Novel"], ["vintage", "Vintage"], ["frame", "Frame"],
  ["stripe", "Stripe"], ["divider", "Divider"], ["journal", "Journal"], ["classic", "Classic"], ["none", "None"],
];
export const FONTS = {
  sans: ["Sans", "A neutral font", "'Figtree', system-ui, sans-serif", 600, "none", 0],
  serif: ["Serif", "A classic font", "Georgia, 'Times New Roman', serif", 400, "none", 0],
  modern: ["Modern", "A sophisticated font", "'Bricolage Grotesque', system-ui, sans-serif", 600, "none", 0],
  timeless: ["Timeless", "A light and airy font", "Didot, 'Bodoni 72', Georgia, serif", 300, "none", 0.02],
  bold: ["Bold", "A punchy font", "'Bricolage Grotesque', system-ui, sans-serif", 800, "uppercase", 0.02],
  subtle: ["Subtle", "A minimal font", "'Figtree', system-ui, sans-serif", 300, "uppercase", 0.2],
};
export const PALETTES = {
  light: ["Light", "#FFFFFF", "#F2F2F2", "#2B2B2B"], jovita: ["Jovita", "#FBF8FF", "#E9DDFB", "#261433"],
  gold: ["Gold", "#FFFDF7", "#F5EFE2", "#A08A5C"], rose: ["Rose", "#FCF8F8", "#F1E8E8", "#A07C7C"],
  terracotta: ["Terracotta", "#FCF8F4", "#F1E6DC", "#A8714E"], sand: ["Sand", "#F8F6F3", "#ECE6DF", "#9C8778"],
  olive: ["Olive", "#F9FAF5", "#ECEEE3", "#8E9670"], agave: ["Agave", "#F6F8F7", "#E6ECE9", "#7D9A90"],
  sea: ["Sea", "#F7F8FA", "#E7EAF0", "#868CA6"], night: ["Night", "#17101F", "#21182B", "#FFB320"],
};
const DEF_DESIGN = { cover: "center", font: "sans", palette: "light", grid: { style: "vertical", size: "regular", spacing: "regular" } };
const DEF_SETTINGS = {
  tags: [], watermark: "none", password: "", show_home: false, exclusive: false,
  download: { on: true, high: true, high_size: "original", web: true, web_size: "1024", video: false, pin_on: true, pin: String(1000 + Math.floor(Math.random() * 9000)) },
  favorite: { on: true, notes: true },
};
const slugify = (s) => String(s || "").toLowerCase().normalize("NFKD").replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-").slice(0, 48);

function toDraft(g) {
  const settings = { ...DEF_SETTINGS, ...(g.settings || {}) };
  settings.download = { ...DEF_SETTINGS.download, ...(g.settings?.download || {}) };
  settings.favorite = { ...DEF_SETTINGS.favorite, ...(g.settings?.favorite || {}) };
  const design = { ...DEF_DESIGN, ...(g.design || {}) };
  design.grid = { ...DEF_DESIGN.grid, ...(g.design?.grid || {}) };
  return {
    title: g.title || "", event_date: g.event_date || "", expires_on: g.expires_on || "", slug: g.slug || slugify(g.title),
    sets: Array.isArray(g.sets) && g.sets.length ? g.sets : [{ id: "highlights", name: "Highlights", description: "" }],
    cover_path: g.cover_path || "", design, settings,
  };
}

/* ---------- Live preview of the client gallery ---------- */
export function GalleryPreview({ d, photos, studioName, device, full = false, onPhoto, favs, onFav, notes }) {
  const pal = PALETTES[d.design.palette] || PALETTES.light;
  const f = FONTS[d.design.font] || FONTS.sans;
  const coverUrl = publicUrl(d.cover_path) || (photos[0] && publicUrl(photos[0].path));
  const g = d.design.grid;
  const titleStyle = { fontFamily: f[2], fontWeight: f[3], textTransform: f[4], letterSpacing: `${f[5]}em` };
  const cover = d.design.cover;
  const bg = coverUrl ? { backgroundImage: `url("${coverUrl}")` } : { background: pal[2] };
  const date = d.event_date ? fdate(d.event_date) : "";
  const title = d.title || tx("Gallery name");
  const btn = <span className="gp-btn" style={{ background: pal[3], color: pal[1] }}>{tx("View gallery")}</span>;
  const coverEl = {
    center: <div className="gp-cover gp-center" style={bg}><div className="gp-shade" /><div className="gp-ttl" style={{ color: "#FFF" }}><h3 style={titleStyle}>{title}</h3><small>{date}</small>{btn}</div></div>,
    left: <div className="gp-cover gp-left" style={bg}><div className="gp-shade" /><div className="gp-ttl" style={{ color: "#FFF" }}><h3 style={titleStyle}>{title}</h3><small>{date}</small>{btn}</div></div>,
    novel: <div className="gp-cover gp-split" style={{ background: pal[1] }}><div className="gp-ttl" style={{ color: pal[3] }}><h3 style={titleStyle}>{title}</h3><small>{date}</small>{btn}</div><div className="gp-img" style={bg} /></div>,
    vintage: <div className="gp-cover gp-vintage" style={{ background: pal[1] }}><div className="gp-img" style={bg} /><div className="gp-ttl" style={{ color: pal[3] }}><h3 style={titleStyle}>{title}</h3><small>{date}</small></div></div>,
    frame: <div className="gp-cover gp-frame" style={{ background: pal[1] }}><div className="gp-img" style={bg}><div className="gp-ttl" style={{ color: "#FFF" }}><h3 style={titleStyle}>{title}</h3><small>{date}</small></div></div></div>,
    stripe: <div className="gp-cover gp-center" style={bg}><div className="gp-shade" /><div className="gp-ttl gp-stripe" style={{ color: "#FFF" }}><h3 style={titleStyle}>{title}</h3><small>{date}</small></div></div>,
    divider: <div className="gp-cover gp-split" style={{ background: pal[1] }}><div className="gp-img" style={bg} /><div className="gp-ttl" style={{ color: pal[3] }}><h3 style={titleStyle}>{title}</h3><small>{date}</small>{btn}</div></div>,
    journal: <div className="gp-cover gp-journal" style={{ background: pal[1] }}><div className="gp-img" style={bg} /><div className="gp-ttl" style={{ color: pal[3], textAlign: "right" }}><h3 style={titleStyle}>{title}</h3><small>{date}</small></div></div>,
    classic: <div className="gp-cover gp-classic" style={{ background: pal[1] }}><div className="gp-img" style={bg} /><div className="gp-ttl" style={{ color: pal[3] }}><h3 style={titleStyle}>{title}</h3><small>{date}</small></div></div>,
    none: <div className="gp-cover gp-none" style={{ background: pal[1] }}><div className="gp-ttl" style={{ color: pal[3] }}><h3 style={titleStyle}>{title}</h3><small>{date}</small></div></div>,
  }[cover] || null;
  // The client's page fits more photos per row on wide screens (4 to 5), the small previews keep 2 to 3
  const wide = full && device !== "phone" ? (window.innerWidth >= 1500 ? 5 : window.innerWidth >= 1100 ? 4 : 3) : 3;
  const cols = device === "phone" ? (g.size === "large" ? 1 : 2) : g.size === "large" ? Math.max(2, wide - 2) : wide;
  // On the client's page each photo gets a heart, and shows how many notes it has
  const item = (p, i, el) => !onFav ? <span key={p.id || p.path} style={{ display: "contents" }}>{el}</span> : (
    <span key={p.id || p.path} className="gp-item">
      {el}
      <button type="button" className="gp-heart" aria-pressed={!!favs?.has(p.id)} onClick={() => onFav(p)} aria-label={favs?.has(p.id) ? tx("Remove from favourites") : tx("Add to favourites")}><Icon name="heart" /></button>
      {notes?.[p.id] ? <span className="gp-notecount"><Icon name="chat" />{notes[p.id]}</span> : null}
    </span>
  );
  const gap = g.spacing === "large" ? 14 : 4;
  return (
    <div className={`gp gp-${device}`} style={{ background: pal[1], color: pal[3] }}>
      {coverEl}
      <div className="gp-nav" style={{ borderColor: pal[2] }}><b style={titleStyle}>{title}</b><span>{studioName}</span><span className="gp-sets">{d.sets.map((s) => <i key={s.id}>{s.name}</i>)}</span></div>
      {photos.length ? (
        g.style === "horizontal"
          ? <div className="gp-rows" style={{ gap, padding: gap }}>{(full ? photos : photos.slice(0, 18)).map((p, i) => item(p, i, <Thumb path={p.path} alt={p.name || ""} thumb={p.has_thumb} onClick={onPhoto ? () => onPhoto(i) : undefined} style={{ height: device === "phone" ? 80 : g.size === "large" ? 180 : 120 }} />))}</div>
          : <div className="gp-masonry" style={{ columnCount: cols, columnGap: gap, padding: gap }}>{(full ? photos : photos.slice(0, 24)).map((p, i) => item(p, i, <Thumb path={p.path} alt={p.name || ""} thumb={p.has_thumb} width={p.width || undefined} height={p.height || undefined} onClick={onPhoto ? () => onPhoto(i) : undefined} style={{ marginBottom: gap }} />))}</div>
      ) : <p className="gp-empty">{tx("There are no photos here yet.")}</p>}
    </div>
  );
}

/* ---------- Small option tiles ---------- */
function Tile({ on, onClick, label, children }) {
  return (
    <button type="button" className="ge-tile" aria-pressed={on} onClick={onClick}>
      <span className="ge-tile-art">{children}</span><span>{label}</span>
    </button>
  );
}
function CoverArt({ k, url }) {
  const img = url ? { backgroundImage: `url("${url}")` } : {};
  const T = <b>{tx("TITLE")}</b>;
  if (k === "none") return <span className="ca ca-none" />;
  if (["novel", "divider"].includes(k)) return <span className={`ca ca-split ${k}`}>{k === "novel" ? <>{T}<i style={img} /></> : <><i style={img} />{T}</>}</span>;
  if (["vintage", "journal", "classic"].includes(k)) return <span className={`ca ca-stack ${k}`}><i style={img} />{T}</span>;
  return <span className={`ca ca-full ${k}`} style={img}>{T}</span>;
}

/* ---------- The editor ---------- */
export default function GalleryEditor({ id, onClose }) {
  const { galleries, studio, client, clients, insert, update, remove, reload } = useData();
  const toast = useToast();
  const g = galleries.find((x) => x.id === id);
  const [tab, setTab] = useState("photos");
  const [sub, setSub] = useState({ photos: "highlights", design: "cover", settings: "general", share: "invite", activity: "downloads" });
  const [photos, setPhotos] = useState([]);
  const [favs, setFavs] = useState([]);          // clients' picks
  const [downloads, setDownloads] = useState([]); // who downloaded what
  const [comments, setComments] = useState([]);  // notes on photos, both ways
  const [onlyFavs, setOnlyFavs] = useState(false);
  const [dupes, setDupes] = useState(null);      // { files, names } when some file names are already in the gallery
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(null);  // the Send / Share window
  const [previews, setPreviews] = useState([]);
  const [deleting, setDeleting] = useState(null); // { done, total }  // files uploading right now, shown straight away
  const [uploading, setUploading] = useState(null);
  const [over, setOver] = useState(false);
  const [setModal, setSetModal] = useState(null); // {id?, name, description}
  const [device, setDevice] = useState("desktop");
  const [preview, setPreview] = useState(false);
  const [picked, setPicked] = useState(() => new Set()); // selected photo ids
  const [viewer, setViewer] = useState(-1);               // photo open in the large viewer
  const [menuFor, setMenuFor] = useState(null);           // photo id whose ••• menu is open
  const fileRef = useRef(null);
  const ui = useUi();
  const plan = ui?.plan?.plan || "free";
  const [d, setD, status, flush] = useAutosave(g ? toDraft(g) : null, async (v) => {
    await update("galleries", id, { title: v.title.trim() || tx("Untitled gallery"), event_date: v.event_date || null, expires_on: v.expires_on || null, slug: slugify(v.slug) || null, sets: v.sets, cover_path: v.cover_path || null, design: v.design, settings: v.settings, updated_at: new Date().toISOString() });
  });

  // Load every photo (the database hands them over 1,000 at a time)
  const loadPhotos = useCallback(async () => {
    const all = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await supabase.from("gallery_photos").select("*").eq("gallery_id", id).order("position", { ascending: true }).range(from, from + 999);
      if (error || !data) break;
      all.push(...data);
      if (data.length < 1000) break;
    }
    setPhotos(all);
    return all;
  }, [id]);
  useEffect(() => { loadPhotos().then((all) => { if (all && all.length !== (g?.photo_count ?? all.length)) update("galleries", id, { photo_count: all.length }).catch(() => {}); }); }, [loadPhotos]); // eslint-disable-line react-hooks/exhaustive-deps
  // Older photos have no light preview copy: make them in the background so the client's gallery opens fast
  const [fixing, setFixing] = useState(null);
  const fixingRef = useRef(false);
  useEffect(() => {
    const todo = photos.filter((p) => p.has_thumb === false && !isRaw(p.path) && !isVideo(p.path));
    if (!todo.length || fixingRef.current) return;
    fixingRef.current = true;
    (async () => {
      let done = 0;
      setFixing({ done, total: todo.length });
      for (const p of todo) {
        try {
          const head = await fetch(thumbUrl(p.path), { method: "HEAD" }).catch(() => null);
          if (!head?.ok) {
            const blob = await (await fetch(publicUrl(p.path))).blob();
            const t = await makeThumb(blob);
            if (t.blob) await supabase.storage.from(BUCKET).upload(thumbPath(p.path), t.blob, { contentType: "image/jpeg", cacheControl: "31536000", upsert: true });
            await supabase.from("gallery_photos").update({ has_thumb: !!t.blob, ...(t.width && !p.width ? { width: t.width, height: t.height } : {}) }).eq("id", p.id);
          } else await supabase.from("gallery_photos").update({ has_thumb: true }).eq("id", p.id);
        } catch { /* try again next time */ }
        setFixing({ done: ++done, total: todo.length });
      }
      setFixing(null); fixingRef.current = false;
      loadPhotos();
    })();
  }, [photos, loadPhotos]);
  const loadFeedback = useCallback(async () => {
    const [f, c, dls] = await Promise.all([
      supabase.from("gallery_favorites").select("*").eq("gallery_id", id),
      supabase.from("gallery_comments").select("*").eq("gallery_id", id).order("created_at", { ascending: true }),
      supabase.from("gallery_downloads").select("*").eq("gallery_id", id).order("created_at", { ascending: false }),
    ]);
    setFavs(f.data || []); setComments(c.data || []); setDownloads(dls.data || []);
  }, [id]);
  useEffect(() => { loadFeedback(); }, [loadFeedback]);
  const favCount = useMemo(() => favs.reduce((m, f) => ({ ...m, [f.photo_id]: (m[f.photo_id] || 0) + 1 }), {}), [favs]);
  const noteCount = useMemo(() => comments.reduce((m, c) => ({ ...m, [c.photo_id]: (m[c.photo_id] || 0) + 1 }), {}), [comments]);
  useEffect(() => {
    const h = (e) => { if (e.key === "Escape" && !setModal && !preview && viewer < 0) { flush(); onClose(); } };
    document.addEventListener("keydown", h);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", h); document.body.style.overflow = ""; };
  }, [flush, onClose, setModal, preview, viewer]);

  const setPhotosInSet = useMemo(() => photos.filter((p) => p.set_id === sub.photos && (!onlyFavs || favCount[p.id])), [photos, sub.photos, onlyFavs, favCount]);
  if (!g || !d) return null;
  const c = client(g.client_id);
  const published = g.status === "delivered";
  const currentSet = d.sets.find((s) => s.id === sub.photos) || d.sets[0];
  const coverUrl = publicUrl(d.cover_path) || (photos[0] && publicUrl(photos[0].path));
  const set = (k, v) => setD((x) => ({ ...x, [k]: v }));
  const setDesign = (k, v) => setD((x) => ({ ...x, design: { ...x.design, [k]: v } }));
  const setGrid = (k, v) => setD((x) => ({ ...x, design: { ...x.design, grid: { ...x.design.grid, [k]: v } } }));
  const setS = (k, v) => setD((x) => ({ ...x, settings: { ...x.settings, [k]: v } }));
  const setDl = (k, v) => setD((x) => ({ ...x, settings: { ...x.settings, download: { ...x.settings.download, [k]: v } } }));
  const setFav = (k, v) => setD((x) => ({ ...x, settings: { ...x.settings, favorite: { ...x.settings.favorite, [k]: v } } }));
  const close = async () => { await flush(); onClose(); };

  async function upload(files, force = false) {
    const all = [...files];
    // Same file name already in this gallery? Ask first, so nothing is uploaded twice
    if (!force) {
      const have = new Set(photos.map((p) => String(p.name || "").toLowerCase()));
      const names = all.filter((f) => have.has(f.name.toLowerCase())).map((f) => f.name);
      if (names.length) { setDupes({ files: all, names }); return; }
    }
    const raws = all.filter((f) => isRaw(f.name));
    if (raws.length && plan !== "studio") {
      toast(tx("RAW files are part of the Studio plan. Upload JPGs, or upgrade to Studio."));
      ui?.openUpgrade?.("studio");
    }
    const list = all.filter((f) => /^image\//.test(f.type) || /^video\//.test(f.type) || isVideo(f.name) || (plan === "studio" && isRaw(f.name)));
    if (!list.length) { if (!raws.length) toast(tx("Add photos (JPG, PNG, WebP, HEIC) or videos (MP4, MOV).")); return; }
    // Storage limit for the plan (Free 500 MB, Pro 1000 GB, Studio unlimited)
    const batch = list.reduce((n, f) => n + f.size, 0);
    try {
      const { data: q } = await supabase.rpc("storage_quota");
      if (q && q.limit != null && Number(q.used) + batch > Number(q.limit)) {
        toast(tx("Not enough storage: {used} of {limit} used. Upgrade for more space.", { used: fmtBytes(Number(q.used)), limit: fmtBytes(Number(q.limit)) }));
        ui?.openUpgrade?.(plan === "free" ? "pro" : "studio");
        return;
      }
    } catch { /* limits not switched on yet */ }
    setUploading({ done: 0, total: list.length, failed: 0, sent: 0, bytes: batch, speed: 0 });
    // Live progress: bytes sent per file, shown on each tile and in the top bar (refreshed 4 times a second)
    const sentBy = new Array(list.length).fill(0);
    const t0 = Date.now();
    const tick = setInterval(() => {
      const sent = sentBy.reduce((a, b) => a + b, 0), secs = (Date.now() - t0) / 1000;
      setUploading((u) => (u ? { ...u, sent, speed: secs > 0.5 ? sent / secs : 0 } : u));
      setPreviews((v) => v.map((x, j) => (x.state === "up" ? { ...x, pct: Math.min(99, Math.round((sentBy[j] / (list[j].size || 1)) * 100)) } : x)));
    }, 250);
    // Show every file straight away while it uploads
    const pv = list.map((f) => ({ key: f.name + f.size + Math.random(), name: f.name, url: /^image\/(jpeg|png|webp|gif)/.test(f.type) ? URL.createObjectURL(f) : "", state: "wait" }));
    setPreviews(pv);
    const start = photos.length;
    const setId = currentSet.id;
    const added = [];
    let next = 0;
    // Four at a time: much faster than one by one, without choking a slow connection
    const worker = async () => {
      while (next < list.length) {
        const i = next++;
        const file = list[i];
        setPreviews((v) => v.map((x, j) => (j === i ? { ...x, state: "up" } : x)));
        try {
          const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
          const path = `${studio.id}/${id}/${crypto.randomUUID ? crypto.randomUUID() : uid() + uid()}.${ext}`;
          const raw = isRaw(file.name);
          const vid = isVideo(file.name) || /^video\//.test(file.type);
          const t = raw ? { blob: null } : vid ? await makeVideoThumb(file) : await makeThumb(file);
          const ups = [putWithProgress(path, file, file.type || "application/octet-stream", (n) => { sentBy[i] = n; })];
          if (t.blob) ups.push(supabase.storage.from(BUCKET).upload(thumbPath(path), t.blob, { contentType: "image/jpeg", cacheControl: "31536000" }));
          const [r1] = await Promise.all(ups);
          if (r1.error) throw r1.error;
          const row = { studio_id: studio.id, gallery_id: id, set_id: setId, path, name: file.name, width: t.width || null, height: t.height || null, position: start + i, bytes: file.size + (t.blob?.size || 0), has_thumb: !!t.blob };
          let { error: e2 } = await supabase.from("gallery_photos").insert(row);
          if (e2 && /bytes|has_thumb/.test(e2.message || "")) { delete row.bytes; delete row.has_thumb; ({ error: e2 } = await supabase.from("gallery_photos").insert(row)); }
          if (e2) throw e2;
          added.push(path);
          setPreviews((v) => v.map((x, j) => (j === i ? { ...x, state: "done" } : x)));
          setUploading((u) => ({ ...u, done: u.done + 1 }));
        } catch (e) {
          setPreviews((v) => v.map((x, j) => (j === i ? { ...x, state: "fail" } : x)));
          setUploading((u) => ({ ...u, done: u.done + 1, failed: u.failed + 1 }));
          toast(tx("Couldn't upload {name}: {err}", { name: file.name, err: e.message }));
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(4, list.length) }, worker));
    await loadPhotos();
    setPreviews((v) => { v.forEach((x) => x.url && URL.revokeObjectURL(x.url)); return []; });
    const { count } = await supabase.from("gallery_photos").select("id", { count: "exact", head: true }).eq("gallery_id", id);
    const patch = { photo_count: count ?? start + added.length };
    // First photos in an empty gallery become its cover
    if (!d.cover_path && added[0]) { set("cover_path", added[0]); patch.cover_path = added[0]; }
    await update("galleries", id, patch);
    clearInterval(tick);
    setUploading(null);
    if (added.length) toast(txn(added.length, "{n} file added", "{n} files added"), true);
  }
  const copyNames = async (list) => {
    const text = list.map((p) => p.name).join(", ");
    try { await navigator.clipboard.writeText(text); toast(txn(list.length, "{n} file name copied", "{n} file names copied"), true); }
    catch { window.prompt(tx("Copy these file names"), text); }
  };
  const sendReply = async (p) => {
    const body = reply.trim(); if (!body) return;
    const { data, error } = await supabase.from("gallery_comments").insert({ studio_id: studio.id, gallery_id: id, photo_id: p.id, from_client: false, author: studio.name || "", body: body.slice(0, 2000) }).select().single();
    if (error) return toast(error.message);
    setComments((c) => [...c, data]); setReply("");
  };
  // Delete fast: photos leave the screen at once, then go in batches (100 at a time, several in parallel)
  async function removePhotos(list) {
    if (!list.length) return;
    if (!window.confirm(list.length === 1 ? tx("Remove this photo from the gallery?") : tx("Remove {n} photos from the gallery?", { n: list.length }))) return;
    const gone = new Set(list.map((p) => p.id));
    setPhotos((ps) => ps.filter((p) => !gone.has(p.id)));
    setPicked(new Set()); setViewer(-1);
    if (list.some((p) => p.path === d.cover_path)) set("cover_path", "");
    const chunks = (a, n) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));
    const pool = async (jobs, size, fn) => { let k = 0; await Promise.all(Array.from({ length: Math.min(size, jobs.length) }, async () => { while (k < jobs.length) await fn(jobs[k++]); })); };
    let done = 0, failed = 0;
    setDeleting({ done: 0, total: list.length });
    await pool(chunks(list.map((p) => p.id), 100), 4, async (ids) => {
      const { error } = await supabase.from("gallery_photos").delete().in("id", ids);
      if (error) failed += ids.length;
      done += ids.length; setDeleting({ done, total: list.length });
    });
    // Files are removed in the background; the photos are already gone from the gallery
    pool(chunks(list.flatMap((p) => [p.path, thumbPath(p.path)]), 500), 3, (ps) => supabase.storage.from(BUCKET).remove(ps)).catch(() => {});
    const fresh = await loadPhotos();
    await update("galleries", id, { photo_count: fresh.length });
    setDeleting(null);
    if (failed) toast(tx("{n} couldn't be removed. Try again.", { n: failed }));
    else toast(txn(list.length, "{n} photo removed", "{n} photos removed"), true);
  }
  async function movePhotos(list, setId) {
    const ids = list.map((p) => p.id);
    for (let i = 0; i < ids.length; i += 100) await supabase.from("gallery_photos").update({ set_id: setId }).in("id", ids.slice(i, i + 100));
    setPicked(new Set());
    await loadPhotos();
    toast(tx("Moved to {name}", { name: d.sets.find((s) => s.id === setId)?.name }));
  }
  const togglePick = (pid) => setPicked((cur) => { const n = new Set(cur); n.has(pid) ? n.delete(pid) : n.add(pid); return n; });
  async function publish(next) {
    await flush();
    await update("galleries", id, next ? { status: "delivered", expires_on: d.expires_on || addDays(60) } : { status: "draft" });
    if (next && !d.expires_on) set("expires_on", addDays(60));
    toast(next ? tx("Gallery published") : tx("Gallery moved back to draft"), next);
  }
  // Send the gallery to an existing client or a new contact, by email from Jovita (publishes it first)
  async function sendGallery() {
    const s0 = sending;
    let to = null;
    if (s0.who === "new") {
      const email = s0.email.trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return toast(tx("Add a valid email address."));
      to = { email, name: s0.name.trim() };
    } else {
      const cl = client(s0.who);
      if (!cl?.email) return toast(tx("Add an email for {name} in Clients first.", { name: cl?.name || tx("this client") }));
      to = { email: cl.email.toLowerCase(), name: cl.name };
    }
    setSending({ ...s0, busy: true });
    try {
      await flush();
      if (s0.who === "new" && s0.save) {
        const exists = clients.find((x) => (x.email || "").toLowerCase() === to.email);
        if (!exists) await insert("clients", { name: to.name || to.email.split("@")[0], email: to.email, phone: "", city: "", status: "client" });
      }
      if (!published) await publish(true);
      const { data: inv, error } = await supabase.from("gallery_invites").upsert([{ studio_id: studio.id, gallery_id: id, email: to.email, name: to.name }], { onConflict: "gallery_id,email", ignoreDuplicates: false }).select().single();
      if (error) throw error;
      const r = await sendEmail("gallery", { gallery_id: id, invite_id: inv.id });
      const link = galleryLink(inv.token);
      if (!r.ok) {
        try { await navigator.clipboard.writeText(link); } catch { /* fine */ }
        setSending((x) => x && { ...x, busy: false, result: { ok: false, to, link, reason: r.reason } });
      } else {
        setSending((x) => x && { ...x, busy: false, result: { ok: true, to, link } });
        toast(tx("Sent to {name}", { name: to.name || to.email }), true);
      }
    } catch (e) { setSending((x) => x && { ...x, busy: false, result: { ok: false, to, reason: e.message } }); }
  }
  const copyLink = async () => {
    if (!published) await publish(true);
    const link = galleryLink(g.share_token);
    try { await navigator.clipboard.writeText(link); toast(tx("Link copied. Paste it anywhere."), true); } catch { window.prompt(tx("Copy this link"), link); }
  };
  function saveSet() {
    const name = setModal.name.trim();
    if (!name) return toast(tx("Give the set a name."));
    if (setModal.id) set("sets", d.sets.map((s) => (s.id === setModal.id ? { ...s, name, description: setModal.description } : s)));
    else { const nid = uid(); set("sets", [...d.sets, { id: nid, name, description: setModal.description }]); setSub((x) => ({ ...x, photos: nid })); }
    setSetModal(null);
  }
  async function deleteSet(s) {
    if (d.sets.length === 1) return toast(tx("A gallery needs at least one set."));
    const n = photos.filter((p) => p.set_id === s.id).length;
    if (!window.confirm(n ? tx("Delete \"{name}\"? Its {n} photos move to \"{first}\".", { name: s.name, n, first: d.sets.find((x) => x.id !== s.id).name }) : tx("Delete \"{name}\"?", { name: s.name }))) return;
    const to = d.sets.find((x) => x.id !== s.id).id;
    if (n) { await supabase.from("gallery_photos").update({ set_id: to }).eq("gallery_id", id).eq("set_id", s.id); await loadPhotos(); }
    set("sets", d.sets.filter((x) => x.id !== s.id));
    setSub((x) => ({ ...x, photos: to }));
  }

  const RAIL = [["photos", "image", "Photos"], ["design", "edit", "Design"], ["settings", "settings", "Settings"], ["share", "send", "Share"], ["activity", "chart", "Activity"]];
  const SUBS = {
    design: [["cover", "Cover", "image"], ["typography", "Typography", "file"], ["color", "Colour", "eye"], ["grid", "Grid", "folder"]],
    settings: [["general", "General", "settings"], ["privacy", "Privacy", "lock"], ["download", "Download", "download", d.settings.download.on], ["favorite", "Favourites", "heart", d.settings.favorite.on]],
    share: [["invite", "Invite people", "users"], ["link", "Gallery link", "link"]],
    activity: [["downloads", "Download activity", "download"], ["favorites", "Favourite activity", "heart"]],
  };
  const showPreview = tab === "design";

  return (
    <div className="sheet-wrap" role="dialog" aria-modal="true" aria-label={d.title}>
      <div className="sheet">
        <header className="sheet-bar">
          <button type="button" className="x" onClick={close} aria-label={tx("Close")}><Icon name="x" /></button>
          <div className="sheet-title"><b>{d.title || tx("Untitled gallery")}</b><span>{c.name}{d.event_date ? " · " + fdate(d.event_date) : ""}</span></div>
          <select className="ge-status" value={published ? "published" : "draft"} onChange={(e) => publish(e.target.value === "published")} aria-label={tx("Status")}>
            <option value="draft">{tx("Draft")}</option><option value="published">{tx("Published")}</option>
          </select>
          <SaveState status={status} />
          <span className="spacer" />
          <button type="button" className="btn btn-secondary btn-sm" onClick={async () => { await flush(); setPreview(true); }}><Icon name="eye" />{tx("Preview")}</button>
          {published && <span className="pill p-success">{tx("Live")}</span>}
          <button type="button" className="btn btn-primary btn-sm" onClick={async () => { await flush(); setSending({ who: g.client_id || clients[0]?.id || "new", name: "", email: "", save: true, busy: false }); }}><Icon name="send" />{tx("Send or share")}</button>
        </header>

        <div className="ge">
          <aside className="ge-rail">
            <div className="ge-cover" style={coverUrl ? { backgroundImage: `url("${coverUrl}")` } : undefined}>{!coverUrl && <Icon name="image" />}</div>
            <div className="ge-tabs" role="tablist">
              {RAIL.map(([k, icon, label]) => <button key={k} type="button" role="tab" aria-selected={tab === k} title={tx(label)} aria-label={tx(label)} onClick={() => setTab(k)}><Icon name={icon} /></button>)}
            </div>
            {tab === "photos" ? (
              <div className="ge-sub">
                <div className="ge-sub-head"><span>{tx("Photo sets")}</span><button type="button" onClick={() => setSetModal({ name: "", description: "" })}><Icon name="plus" />{tx("Add set")}</button></div>
                {d.sets.map((s) => (
                  <div key={s.id} className="ge-set" aria-current={sub.photos === s.id}>
                    <button type="button" onClick={() => setSub((x) => ({ ...x, photos: s.id }))}>{s.name} <span className="count">({photos.filter((p) => p.set_id === s.id).length})</span></button>
                    <button type="button" className="ge-mini" onClick={() => setSetModal({ ...s })} aria-label={tx("Edit set {name}", { name: s.name })}><Icon name="edit" /></button>
                    <button type="button" className="ge-mini" onClick={() => deleteSet(s)} aria-label={tx("Delete set {name}", { name: s.name })}><Icon name="x" /></button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="ge-sub">
                <div className="ge-sub-head"><span>{tx(RAIL.find((r) => r[0] === tab)[2])}</span></div>
                {SUBS[tab].map(([k, label, icon, on]) => (
                  <button key={k} type="button" className="ge-subbtn" aria-current={sub[tab] === k} onClick={() => setSub((x) => ({ ...x, [tab]: k }))}>
                    <Icon name={icon} /><span>{tx(label)}</span>{on !== undefined && <span className={`ge-on ${on ? "on" : ""}`}>{on ? tx("ON") : tx("OFF")}</span>}
                  </button>
                ))}
              </div>
            )}
          </aside>

          <main className={`ge-main ${showPreview ? "with-preview" : ""}`}>
            <div className="ge-panel">
              {/* PHOTOS */}
              {tab === "photos" && (
                <>
                  <div className="set-head"><div><h2 className="h-m">{currentSet.name}</h2>{currentSet.description && <p className="sub" style={{ fontSize: 13 }}>{currentSet.description}</p>}</div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
                      {favs.length > 0 && <button type="button" className="btn btn-ghost btn-sm" aria-pressed={onlyFavs} onClick={() => setOnlyFavs(!onlyFavs)}><Icon name="heart" />{onlyFavs ? tx("Show all") : tx("Client picks ({n})", { n: Object.keys(favCount).length })}</button>}
                      {onlyFavs && setPhotosInSet.length > 0 && <button type="button" className="btn btn-ghost btn-sm" onClick={() => copyNames(setPhotosInSet)}><Icon name="file" />{tx("Copy file names")}</button>}
                      {setPhotosInSet.length > 0 && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPicked(picked.size === setPhotosInSet.length ? new Set() : new Set(setPhotosInSet.map((p) => p.id)))}>{picked.size === setPhotosInSet.length ? tx("Clear selection") : tx("Select all")}</button>}
                      <button type="button" className="btn btn-primary btn-sm" onClick={() => fileRef.current?.click()} disabled={!!uploading}><Icon name="plus" />{tx("Add photos or videos")}</button>
                    </div>
                    <input ref={fileRef} type="file" accept={"image/*,video/mp4,video/quicktime,video/webm,.mov,.mp4,.m4v" + (plan === "studio" ? "," + RAW_EXT.map((e) => "." + e).join(",") : "")} multiple hidden onChange={(e) => { upload(e.target.files); e.target.value = ""; }} /></div>
                  {setPhotosInSet.length > 0 && !picked.size && !uploading && !deleting && <p className="sub ge-hint">{tx("Click a photo to select it. Double-click to open it.")}</p>}
                  {fixing && !uploading && <p className="sub" style={{ fontSize: 13 }}>{tx("Making fast previews for your client… {a} of {b}", { a: fixing.done, b: fixing.total })}</p>}
                  {deleting && <div className="ge-progress del" role="status"><span style={{ width: `${(deleting.done / deleting.total) * 100}%` }} /><b>{tx("Deleting {a} of {b}…", { a: deleting.done, b: deleting.total })}</b></div>}
                  {uploading && (() => {
                    const pct = uploading.bytes ? Math.min(100, Math.round((uploading.sent / uploading.bytes) * 100)) : Math.round((uploading.done / uploading.total) * 100);
                    const left = uploading.speed > 0 ? Math.max(0, (uploading.bytes - uploading.sent) / uploading.speed) : null;
                    const eta = left == null ? "" : left < 60 ? tx("{n}s left", { n: Math.ceil(left) }) : tx("about {n} min left", { n: Math.ceil(left / 60) });
                    return (
                      <div className="ge-progress" role="status" aria-live="polite"><span style={{ width: `${pct}%` }} />
                        <b>{tx("Uploading {a} of {b}", { a: Math.min(uploading.done + 1, uploading.total), b: uploading.total })} · {pct}%</b>
                        <em>{fmtBytes(uploading.sent)} / {fmtBytes(uploading.bytes)}{uploading.speed ? ` · ${fmtBytes(uploading.speed)}/s` : ""}{eta ? ` · ${eta}` : ""}</em></div>
                    );
                  })()}
                  {picked.size > 0 && (
                    <div className="ge-selbar" role="toolbar" aria-label={tx("Selected photos")}>
                      <b>{txn(picked.size, "{n} selected", "{n} selected")}</b>
                      <button type="button" onClick={() => setPicked(new Set())}><Icon name="x" />{tx("Deselect all")}</button>
                      {picked.size < setPhotosInSet.length && <button type="button" onClick={() => setPicked(new Set(setPhotosInSet.map((p) => p.id)))}><Icon name="check" />{tx("Select all")}</button>}
                      <span className="spacer" />
                      {picked.size === 1 && <button type="button" onClick={() => { const p = photos.find((x) => picked.has(x.id)); set("cover_path", p.path); setPicked(new Set()); toast(tx("Cover photo set")); }}><Icon name="star" />{tx("Set as cover")}</button>}
                      {d.sets.length > 1 && <select aria-label={tx("Move to set")} value="" onChange={(e) => e.target.value && movePhotos(photos.filter((x) => picked.has(x.id)), e.target.value)}><option value="">{tx("Move to…")}</option>{d.sets.filter((x) => x.id !== currentSet.id).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>}
                      <button type="button" className="danger" onClick={() => removePhotos(photos.filter((x) => picked.has(x.id)))}><Icon name="x" />{tx("Delete")}</button>
                    </div>
                  )}
                  <div className={`ge-drop ${over ? "on" : ""} ${setPhotosInSet.length || previews.length ? "has" : ""}`} onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={(e) => { e.preventDefault(); setOver(false); upload(e.dataTransfer.files); }}>
                    {setPhotosInSet.length || previews.length ? (
                      <div className={`ge-grid ${picked.size ? "picking" : ""}`}>
                        {previews.map((x) => (
                          <div className="ge-cell" key={x.key}>
                            <figure className={`ge-photo ge-up ${x.state}`}>
                              {x.url ? <img src={x.url} alt="" /> : <span className="ge-up-file"><Icon name="image" /></span>}
                              <span className="ge-up-state">{x.state === "done" ? <Icon name="check" /> : x.state === "fail" ? <Icon name="x" /> : <i className="ge-spin" />}</span>
                              {x.state === "up" && <span className="ge-up-bar" aria-hidden="true"><i style={{ width: `${x.pct || 2}%` }} /></span>}
                              {x.state === "up" && <span className="ge-up-pct">{x.pct || 0}%</span>}
                            </figure>
                          </div>
                        ))}
                        {setPhotosInSet.map((p, i) => {
                          const on = picked.has(p.id);
                          return (
                            <div className="ge-cell" key={p.id}>
                            <figure className={`ge-photo ${on ? "on" : ""} ${d.cover_path === p.path ? "is-cover" : ""}`}>
                              <button type="button" className="ge-hit" title={p.name} onClick={() => togglePick(p.id)} onDoubleClick={() => setViewer(i)} aria-pressed={on} aria-label={tx("Select {name}. Double-click to open.", { name: p.name })}>
                                <Thumb path={p.path} alt={p.name} thumb={p.has_thumb} />
                              </button>
                              <button type="button" className="ge-check" aria-pressed={on} onClick={() => togglePick(p.id)} aria-label={on ? tx("Unselect photo") : tx("Select photo")}><Icon name="check" /></button>
                              {d.cover_path === p.path && <span className="ge-badge">{tx("Cover")}</span>}
                              {(favCount[p.id] || noteCount[p.id]) && <span className="ge-marks">{favCount[p.id] ? <span title={tx("Client favourite")}><Icon name="heart" />{favCount[p.id] > 1 ? favCount[p.id] : ""}</span> : null}{noteCount[p.id] ? <span title={tx("Comments")}><Icon name="chat" />{noteCount[p.id]}</span> : null}</span>}
                              <button type="button" className="ge-more" onClick={() => setMenuFor(menuFor === p.id ? null : p.id)} aria-label={tx("More options")} aria-expanded={menuFor === p.id}>•••</button>
                              {menuFor === p.id && (
                                <div className="ge-menu" role="menu" onMouseLeave={() => setMenuFor(null)}>
                                  <button type="button" role="menuitem" onClick={() => { setMenuFor(null); setViewer(i); }}><Icon name="eye" />{tx("Open")}</button>
                                  <button type="button" role="menuitem" onClick={() => { setMenuFor(null); set("cover_path", p.path); toast(tx("Cover photo set")); }}><Icon name="star" />{tx("Set as cover")}</button>
                                  <a role="menuitem" href={downloadUrl(p.path, p.name)} download={p.name} onClick={() => setMenuFor(null)}><Icon name="download" />{tx("Download")}</a>
                                  <button type="button" role="menuitem" onClick={() => { setMenuFor(null); copyNames([p]); }}><Icon name="file" />{tx("Copy file name")}</button>
                                  {d.sets.length > 1 && d.sets.filter((x) => x.id !== p.set_id).map((x) => <button key={x.id} type="button" role="menuitem" onClick={() => { setMenuFor(null); movePhotos([p], x.id); }}><Icon name="folder" />{tx("Move to {name}", { name: x.name })}</button>)}
                                  <button type="button" role="menuitem" className="danger" onClick={() => { setMenuFor(null); removePhotos([p]); }}><Icon name="x" />{tx("Delete")}</button>
                                </div>
                              )}
                            </figure>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="ge-empty">
                        <Icon name="image" />
                        <b>{tx("Drag photos or videos here to upload")}</b>
                        <span className="sub">{tx("or")}</span>
                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => fileRef.current?.click()}>{tx("Choose from your computer")}</button>
                        <span className="sub" style={{ fontSize: 12 }}>{plan === "studio" ? tx("Photos (JPG, PNG, WebP, HEIC, RAW) and videos (MP4, MOV)") : tx("Photos (JPG, PNG, WebP, HEIC) and videos (MP4, MOV)")}</span>
                      </div>
                    )}
                  </div>

                </>
              )}

              {/* DESIGN */}
              {tab === "design" && sub.design === "cover" && (
                <><div className="set-head"><h2 className="h-m">{tx("Cover")}</h2><span className="sub" style={{ fontSize: 13 }}>{tx("Pick a cover photo with the star on any photo.")}</span></div>
                  <div className="ge-tiles">{COVERS.map(([k, l]) => <Tile key={k} on={d.design.cover === k} onClick={() => setDesign("cover", k)} label={tx(l)}><CoverArt k={k} url={coverUrl} /></Tile>)}</div></>
              )}
              {tab === "design" && sub.design === "typography" && (
                <><h2 className="h-m">{tx("Typography")}</h2>
                  <div className="ge-tiles">{Object.entries(FONTS).map(([k, f]) => <Tile key={k} on={d.design.font === k} onClick={() => setDesign("font", k)} label={tx(f[0])}><span className="fa"><b style={{ fontFamily: f[2], fontWeight: f[3], textTransform: f[4], letterSpacing: `${f[5]}em` }}>{tx(f[0])}</b><small>{tx(f[1])}</small></span></Tile>)}</div></>
              )}
              {tab === "design" && sub.design === "color" && (
                <><h2 className="h-m">{tx("Colour")}</h2>
                  <div className="ge-tiles">{Object.entries(PALETTES).map(([k, p]) => <Tile key={k} on={d.design.palette === k} onClick={() => setDesign("palette", k)} label={tx(p[0])}><span className="pa">{p.slice(1).map((col) => <i key={col} style={{ background: col }} />)}</span></Tile>)}</div></>
              )}
              {tab === "design" && sub.design === "grid" && (
                <><h2 className="h-m">{tx("Grid")}</h2>
                  {[["style", "Grid style", [["vertical", "Vertical"], ["horizontal", "Horizontal"]]], ["size", "Thumbnail size", [["regular", "Regular"], ["large", "Large"]]], ["spacing", "Grid spacing", [["regular", "Regular"], ["large", "Large"]]]].map(([k, label, opts]) => (
                    <div key={k} className="field"><label>{tx(label)}</label>
                      <div className="ge-tiles two">{opts.map(([v, l]) => <Tile key={v} on={d.design.grid[k] === v} onClick={() => setGrid(k, v)} label={tx(l)}><span className={`ga ga-${k}-${v}`}><i /><i /><i /><i /></span></Tile>)}</div></div>
                  ))}</>
              )}

              {/* SETTINGS */}
              {tab === "settings" && sub.settings === "general" && (
                <><h2 className="h-m">{tx("General settings")}</h2>
                  <div className="field"><label htmlFor="ge-title">{tx("Gallery name")}</label><input id="ge-title" value={d.title} onChange={(e) => set("title", e.target.value)} /></div>
                  <div className="form-grid">
                    <div className="field"><label htmlFor="ge-date">{tx("Event date")}</label><input id="ge-date" type="date" value={d.event_date} onChange={(e) => set("event_date", e.target.value)} /></div>
                    <div className="field"><label htmlFor="ge-exp">{tx("Expiry date")}</label><input id="ge-exp" type="date" value={d.expires_on} onChange={(e) => set("expires_on", e.target.value)} /><span className="help">{tx("After this, clients can't open the gallery. Leave blank to keep it open.")}</span></div>
                  </div>
                  <div className="field"><label htmlFor="ge-slug">{tx("Gallery link")}</label>
                    <div className="ge-slug"><span>/g/</span><input id="ge-slug" value={d.slug} onChange={(e) => set("slug", slugify(e.target.value))} /></div>
                    <span className="help">{tx("A short, memorable address for your client.")}</span></div>
                  <div className="field"><label htmlFor="ge-tags">{tx("Category tags")}</label>
                    <input id="ge-tags" value={d.settings.tags.join(", ")} onChange={(e) => setS("tags", e.target.value.split(",").map((s) => s.trimStart()).filter((s, i, a) => s || i === a.length - 1))} placeholder={tx("e.g. wedding, outdoor, summer")} />
                    <span className="help">{tx("Separate with commas. Helps you find galleries later.")}</span></div>
                  <div className="field"><label htmlFor="ge-wm">{tx("Watermark")}</label>
                    <select id="ge-wm" value={d.settings.watermark} onChange={(e) => setS("watermark", e.target.value)}><option value="none">{tx("No watermark")}</option><option value="studio">{tx("Studio name")} · {studio.name}</option></select></div></>
              )}
              {tab === "settings" && sub.settings === "privacy" && (
                <><h2 className="h-m">{tx("Privacy")}</h2>
                  <div className="field"><label htmlFor="ge-pw">{tx("Gallery password")}</label>
                    <div className="ge-slug"><input id="ge-pw" value={d.settings.password} onChange={(e) => setS("password", e.target.value)} placeholder={tx("Add a password")} /><button type="button" className="btn btn-ghost btn-sm" onClick={() => setS("password", Math.random().toString(36).slice(2, 8))}>{tx("Generate")}</button></div>
                    <span className="help">{tx("Visitors need this password to see the gallery.")}</span></div>
                  <div className="switch"><div><b>{tx("Show on your homepage")}</b><span>{tx("List this gallery on your public portfolio page.")}</span></div><Toggle on={d.settings.show_home} label={tx("Show on homepage")} onChange={(v) => setS("show_home", v)} /></div>
                  <div className="switch"><div><b>{tx("Client-only sets")}</b><span>{tx("Your client can see private sets and hide photos from guests.")}</span></div><Toggle on={d.settings.exclusive} label={tx("Client-only sets")} onChange={(v) => setS("exclusive", v)} /></div></>
              )}
              {tab === "settings" && sub.settings === "download" && (
                <><h2 className="h-m">{tx("Download")}</h2>
                  <div className="switch"><div><b>{tx("Photo download")}</b><span>{tx("Let visitors download photos from the gallery.")}</span></div><Toggle on={d.settings.download.on} label={tx("Photo download")} onChange={(v) => setDl("on", v)} /></div>
                  {d.settings.download.on && (
                    <div className="field"><label>{tx("Download sizes")}</label>
                      <div className="ge-sizes">
                        <label className="check"><input type="checkbox" checked={d.settings.download.high} onChange={(e) => setDl("high", e.target.checked)} />{tx("High resolution")}</label>
                        <div className="chips">{[["original", "Original"], ["3600", "3600px"]].map(([v, l]) => <button key={v} type="button" className="chip" aria-pressed={d.settings.download.high_size === v} disabled={!d.settings.download.high} onClick={() => setDl("high_size", v)}>{tx(l)}</button>)}</div>
                        <label className="check"><input type="checkbox" checked={d.settings.download.web} onChange={(e) => setDl("web", e.target.checked)} />{tx("Web size")}</label>
                        <div className="chips">{["2048", "1024", "640"].map((v) => <button key={v} type="button" className="chip" aria-pressed={d.settings.download.web_size === v} disabled={!d.settings.download.web} onClick={() => setDl("web_size", v)}>{v}px</button>)}</div>
                      </div></div>
                  )}
                  <div className="switch"><div><b>{tx("Video download")}</b><span>{tx("Let visitors save videos for offline viewing.")}</span></div><Toggle on={d.settings.download.video} label={tx("Video download")} onChange={(v) => setDl("video", v)} /></div>
                  <div className="switch"><div><b>{tx("Download PIN")}</b><span>{tx("Visitors enter a 4-digit PIN to download.")}</span></div><Toggle on={d.settings.download.pin_on} label={tx("Download PIN")} onChange={(v) => setDl("pin_on", v)} /></div>
                  {d.settings.download.pin_on && <div className="ge-slug ge-pin"><b className="num">{d.settings.download.pin}</b><button type="button" className="btn btn-ghost btn-sm" onClick={() => setDl("pin", String(1000 + Math.floor(Math.random() * 9000)))}>{tx("Reset PIN")}</button></div>}</>
              )}
              {tab === "settings" && sub.settings === "favorite" && (
                <><h2 className="h-m">{tx("Favourites")}</h2>
                  <div className="switch"><div><b>{tx("Favourite photos")}</b><span>{tx("Clients heart their picks. Their picks start your editing clock.")}</span></div><Toggle on={d.settings.favorite.on} label={tx("Favourite photos")} onChange={(v) => setFav("on", v)} /></div>
                  <div className="switch"><div><b>{tx("Favourite notes")}</b><span>{tx("Clients can add a note to a photo they love, like \"crop tighter\".")}</span></div><Toggle on={d.settings.favorite.notes} label={tx("Favourite notes")} onChange={(v) => setFav("notes", v)} /></div></>
              )}

              {/* SHARE: invite by email, track who viewed */}
              {tab === "share" && <GalleryShare g={g} view={sub.share} published={published} publish={publish} />}

              {/* ACTIVITY */}
              {tab === "activity" && (
                <><h2 className="h-m">{sub.activity === "downloads" ? tx("Download activity") : tx("Favourite activity")}</h2>
                  {sub.activity === "downloads" && downloads.length > 0 ? (
                    <div className="ge-picks">
                      <p className="sub">{txn(downloads.reduce((n, x) => n + (x.files || 1), 0), "{n} file downloaded so far", "{n} files downloaded so far")}</p>
                      {downloads.map((x) => (
                        <div key={x.id} className="switch"><div><b>{x.viewer_name || (x.viewer.includes("@") ? x.viewer : tx("A visitor"))}</b>
                          <span>{x.kind === "zip" ? tx("Downloaded {label} as a zip ({n} files)", { label: x.label || tx("all photos"), n: x.files }) : tx("Downloaded {label}", { label: x.label })} · {fdate(x.created_at)} {new Date(x.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span></div>
                          <Icon name="download" /></div>
                      ))}
                    </div>
                  ) : sub.activity === "favorites" && favs.length > 0 ? (
                    <div className="ge-picks">
                      {Object.entries(favs.reduce((m, f) => { (m[f.viewer_name || f.viewer] ||= []).push(f); return m; }, {})).map(([who, list]) => {
                        const ps = list.map((f) => photos.find((p) => p.id === f.photo_id)).filter(Boolean);
                        return (
                          <section key={who} className="card ge-pick-card">
                            <div className="set-head"><b>{tx("{name} picked {n}", { name: who, n: ps.length })}</b><button type="button" className="btn btn-secondary btn-sm" onClick={() => copyNames(ps)}><Icon name="file" />{tx("Copy file names")}</button></div>
                            <p className="ge-pick-names">{ps.map((p) => p.name).join(", ")}</p>
                          </section>
                        );
                      })}
                    </div>
                  ) :
                  <div className="ge-empty ge-activity">
                    <Icon name={sub.activity === "downloads" ? "download" : "heart"} />
                    <b>{sub.activity === "downloads" ? txn(g.downloads || 0, "{n} download so far", "{n} downloads so far") : txn(g.favourites || 0, "{n} favourite so far", "{n} favourites so far")}</b>
                    <span className="sub">{sub.activity === "downloads" ? tx("Who downloaded what shows here once your client opens the gallery.") : tx("Your client's hearts and notes show here as they pick.")}</span>
                  </div>}</>
              )}
            </div>

            {showPreview && (
              <div className="ge-preview">
                <GalleryPreview d={d} photos={photos} studioName={studio.name} device={device} />
                <div className="ge-devices" role="group" aria-label={tx("Preview size")}>
                  <button type="button" aria-pressed={device === "desktop"} onClick={() => setDevice("desktop")}>{tx("Desktop")}</button>
                  <button type="button" aria-pressed={device === "phone"} onClick={() => setDevice("phone")}>{tx("Phone")}</button>
                </div>
              </div>
            )}
          </main>
        </div>
      </div>

      {setModal && (
        <div className="scrim modal-wrap" style={{ zIndex: 60 }} onMouseDown={(e) => e.target === e.currentTarget && setSetModal(null)}>
          <form className="modal" role="dialog" aria-modal="true" aria-label={setModal.id ? tx("Edit set") : tx("New photo set")} onSubmit={(e) => { e.preventDefault(); saveSet(); }}>
            <div className="set-head"><h2 className="h-l">{setModal.id ? tx("Edit set") : tx("New photo set")}</h2><button type="button" className="x" onClick={() => setSetModal(null)} aria-label={tx("Close")}><Icon name="x" /></button></div>
            <div className="field"><label htmlFor="ge-sn">{tx("Set name")}</label><input id="ge-sn" autoFocus value={setModal.name} onChange={(e) => setSetModal({ ...setModal, name: e.target.value })} placeholder={tx("e.g. Ceremony, Reception, Getting ready")} /></div>
            <div className="field"><label htmlFor="ge-sd">{tx("Description")}</label><textarea id="ge-sd" maxLength={500} value={setModal.description} onChange={(e) => setSetModal({ ...setModal, description: e.target.value })} placeholder={tx("Optional")} /><span className="help">{setModal.description.length}/500 · {tx("Shown to clients viewing this set.")}</span></div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}><button type="button" className="btn btn-ghost" onClick={() => setSetModal(null)}>{tx("Cancel")}</button><button className="btn btn-primary">{tx("Save")}</button></div>
          </form>
        </div>
      )}

      {viewer >= 0 && setPhotosInSet[viewer] && (
        <div className="cg-light" role="dialog" aria-modal="true" aria-label={setPhotosInSet[viewer].name} onClick={(e) => e.target === e.currentTarget && setViewer(-1)}
          onKeyDown={(e) => { if (e.key === "ArrowRight") setViewer((v) => Math.min(setPhotosInSet.length - 1, v + 1)); if (e.key === "ArrowLeft") setViewer((v) => Math.max(0, v - 1)); if (e.key === "Escape") { e.stopPropagation(); setViewer(-1); } }} tabIndex={-1} ref={(el) => el?.focus()}>
          {isRaw(setPhotosInSet[viewer].path) ? <span className="raw-tile big">RAW</span>
            : isVideo(setPhotosInSet[viewer].path) ? <video key={setPhotosInSet[viewer].id} src={publicUrl(setPhotosInSet[viewer].path)} controls autoPlay playsInline poster={thumbUrl(setPhotosInSet[viewer].path)} />
            : <img src={publicUrl(setPhotosInSet[viewer].path)} alt={setPhotosInSet[viewer].name} />}
          {(() => {
            const p = setPhotosInSet[viewer];
            const notes = comments.filter((c) => c.photo_id === p.id);
            const lovers = favs.filter((f) => f.photo_id === p.id);
            return (
              <aside className="lb-notes" onClick={(e) => e.stopPropagation()}>
                <b className="lb-file">{p.name}</b>
                {lovers.length > 0 && <p className="lb-love"><Icon name="heart" />{tx("Favourite of {names}", { names: lovers.map((f) => f.viewer_name || tx("your client")).join(", ") })}</p>}
                <div className="lb-thread">
                  {notes.length ? notes.map((c) => <div key={c.id} className={`lb-note ${c.from_client ? "" : "me"}`}><small>{c.from_client ? c.author || tx("Client") : tx("You")}</small>{c.body}</div>)
                    : <p className="sub" style={{ fontSize: 13 }}>{tx("No comments on this one yet. Your client can leave notes like \"remove the sign in the back\".")}</p>}
                </div>
                <form className="lb-reply" onSubmit={(e) => { e.preventDefault(); sendReply(p); }}>
                  <input value={reply} onChange={(e) => setReply(e.target.value)} placeholder={tx("Reply to your client…")} aria-label={tx("Reply")} onKeyDown={(e) => e.stopPropagation()} />
                  <button className="btn btn-primary btn-sm" disabled={!reply.trim()}><Icon name="send" /></button>
                </form>
              </aside>
            );
          })()}
          <button type="button" className="cg-x" onClick={() => setViewer(-1)} aria-label={tx("Close")}><Icon name="x" /></button>
          {viewer > 0 && <button type="button" className="cg-prev" onClick={() => setViewer(viewer - 1)} aria-label={tx("Previous photo")}>‹</button>}
          {viewer < setPhotosInSet.length - 1 && <button type="button" className="cg-next" onClick={() => setViewer(viewer + 1)} aria-label={tx("Next photo")}>›</button>}
          <div className="ge-lb-bar">
            <span><b style={{ textTransform: "uppercase" }}>{setPhotosInSet[viewer].name}</b> · {viewer + 1} / {setPhotosInSet.length}</span>
            <a className="btn btn-secondary btn-sm" href={downloadUrl(setPhotosInSet[viewer].path, setPhotosInSet[viewer].name)} download={setPhotosInSet[viewer].name}><Icon name="download" />{tx("Download")}</a>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => { set("cover_path", setPhotosInSet[viewer].path); toast(tx("Cover photo set")); }}><Icon name="star" />{tx("Set as cover")}</button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => removePhotos([setPhotosInSet[viewer]])}><Icon name="x" />{tx("Delete")}</button>
          </div>
        </div>
      )}

      {sending && (
        <div className="scrim modal-wrap" style={{ zIndex: 60 }} onMouseDown={(e) => e.target === e.currentTarget && setSending(null)}>
          {sending.result ? (
            <div className="modal" role="dialog" aria-modal="true" aria-label={sending.result.ok ? tx("Sent") : tx("Not sent")}>
              <div className={`send-result ${sending.result.ok ? "ok" : "bad"}`}>
                <span className="send-ic"><Icon name={sending.result.ok ? "check" : "x"} /></span>
                <h2 className="h-m">{sending.result.ok ? tx("Sent!") : tx("The email didn't go out")}</h2>
                <p className="sub">{sending.result.ok
                  ? tx("{name} will get an email with their gallery link in a minute. You'll see in Activity when they open it.", { name: sending.result.to.name || sending.result.to.email })
                  : tx("Reason: {reason}", { reason: sending.result.reason || tx("unknown") })}</p>
              </div>
              {sending.result.link && <div className="field"><label>{sending.result.ok ? tx("Their link") : tx("Send them this link yourself (it's copied)")}</label>
                <div className="ge-slug"><input readOnly value={sending.result.link} onFocus={(e) => e.target.select()} /><button type="button" className="btn btn-ghost btn-sm" onClick={async () => { try { await navigator.clipboard.writeText(sending.result.link); toast(tx("Link copied"), true); } catch { /* shown */ } }}>{tx("Copy")}</button></div></div>}
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, flexWrap: "wrap" }}>
                <button type="button" className="btn btn-ghost" onClick={() => setSending({ ...sending, result: null, who: "new", name: "", email: "" })}>{tx("Send to someone else")}</button>
                <button type="button" className="btn btn-primary" onClick={() => setSending(null)}>{tx("Done")}</button>
              </div>
            </div>
          ) : (
          <form className="modal" role="dialog" aria-modal="true" aria-label={tx("Send or share")} onSubmit={(e) => { e.preventDefault(); sendGallery(); }}>
            <div className="set-head"><h2 className="h-m">{tx("Send \"{title}\"", { title: d.title || tx("this gallery") })}</h2><button type="button" className="x" onClick={() => setSending(null)} aria-label={tx("Close")}><Icon name="x" /></button></div>
            <div className="field"><label htmlFor="gs-who">{tx("Send to")}</label>
              <select id="gs-who" value={sending.who} onChange={(e) => setSending({ ...sending, who: e.target.value })}>
                {clients.map((cl) => <option key={cl.id} value={cl.id}>{cl.name}{cl.email ? ` (${cl.email})` : ` · ${tx("no email")}`}</option>)}
                <option value="new">{tx("+ Someone new")}</option>
              </select></div>
            {sending.who === "new" && (<>
              <div className="form-grid">
                <div className="field"><label htmlFor="gs-name">{tx("Name")}</label><input id="gs-name" value={sending.name} onChange={(e) => setSending({ ...sending, name: e.target.value })} autoFocus /></div>
                <div className="field"><label htmlFor="gs-email">{tx("Email")}</label><input id="gs-email" type="email" value={sending.email} onChange={(e) => setSending({ ...sending, email: e.target.value })} /></div>
              </div>
              <label className="check"><input type="checkbox" checked={sending.save} onChange={(e) => setSending({ ...sending, save: e.target.checked })} />{tx("Save them to my clients")}</label>
            </>)}
            <div className="field"><label>{tx("What can they do?")}</label>
              <div className="seg" role="group" aria-label={tx("What can they do?")}>
                <button type="button" aria-pressed={!d.settings.download.on} onClick={() => setDl("on", false)}>{tx("Pick favourites only")}</button>
                <button type="button" aria-pressed={!!d.settings.download.on} onClick={() => setDl("on", true)}>{tx("Pick and download")}</button>
              </div>
              <span className="help">{d.settings.download.on ? tx("They can download one by one or everything as a zip, with the original file names.") + (d.settings.download.pin_on ? " " + tx("Download PIN: {pin}", { pin: d.settings.download.pin }) : "") : tx("They can view, heart their picks and leave notes. No downloads, ideal for selecting photos to edit.")}</span></div>
            <p className="sub" style={{ fontSize: 13 }}>{published ? tx("They get a branded email with their own link, so you'll see when they open it.") : tx("The gallery will be published, then they get a branded email with their own link.")}{d.settings?.password ? " " + tx("Remember to send them the password: {pw}", { pw: d.settings.password }) : ""}</p>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
              <button type="button" className="btn btn-ghost" onClick={copyLink}><Icon name="link" />{tx("Copy link to share")}</button>
              <button className="btn btn-primary" disabled={sending.busy}><Icon name="send" />{sending.busy ? tx("Sending…") : tx("Send")}</button>
            </div>
          </form>
          )}
        </div>
      )}

      {dupes && (
        <div className="scrim modal-wrap" style={{ zIndex: 60 }} onMouseDown={(e) => e.target === e.currentTarget && setDupes(null)}>
          <div className="modal" role="dialog" aria-modal="true" aria-label={tx("Some files are already here")}>
            <h2 className="h-m">{txn(dupes.names.length, "{n} file is already in this gallery", "{n} files are already in this gallery")}</h2>
            <p className="ge-pick-names">{dupes.names.slice(0, 30).join(", ")}{dupes.names.length > 30 ? "…" : ""}</p>
            <p className="sub" style={{ fontSize: 13 }}>{tx("Files are matched by name, so your client's picks always line up with the files on your computer.")}</p>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, flexWrap: "wrap" }}>
              <button type="button" className="btn btn-ghost" onClick={() => setDupes(null)}>{tx("Cancel")}</button>
              <button type="button" className="btn btn-secondary" onClick={() => { const f = dupes.files; setDupes(null); upload(f, true); }}>{tx("Upload anyway")}</button>
              <button type="button" className="btn btn-primary" disabled={dupes.names.length === dupes.files.length} onClick={() => { const skip = new Set(dupes.names.map((n) => n.toLowerCase())); const f = dupes.files.filter((x) => !skip.has(x.name.toLowerCase())); setDupes(null); upload(f, true); }}>{tx("Skip them, upload the rest")}</button>
            </div>
          </div>
        </div>
      )}

      {preview && (
        <div className="ge-full" role="dialog" aria-modal="true" aria-label={tx("Gallery preview")}>
          <div className="ge-full-bar"><b>{tx("Preview")}</b><span className="sub">{tx("This is what your client sees.")}</span><span className="spacer" />
            <div className="ge-devices inline">{["desktop", "phone"].map((v) => <button key={v} type="button" aria-pressed={device === v} onClick={() => setDevice(v)}>{tx(v === "desktop" ? "Desktop" : "Phone")}</button>)}</div>
            <button type="button" className="x" onClick={() => setPreview(false)} aria-label={tx("Close preview")}><Icon name="x" /></button></div>
          <div className="ge-full-body"><GalleryPreview d={d} photos={photos} studioName={studio.name} device={device} /></div>
        </div>
      )}
    </div>
  );
}
