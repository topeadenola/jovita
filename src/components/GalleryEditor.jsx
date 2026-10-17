import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../supabase";
import { useData } from "../lib/data";
import { SaveState, useAutosave } from "../lib/autosave";
import { addDays, fdate } from "../lib/format";
import { tx, txn } from "../lib/i18n";
import { Toggle, useToast } from "./ui";
import Icon from "./Icon";
import GalleryShare from "./GalleryShare";

const BUCKET = "gallery-photos";
const uid = () => Math.random().toString(36).slice(2, 9);
export const publicUrl = (path) => (path ? supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl : "");

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
export function GalleryPreview({ d, photos, studioName, device, full = false, onPhoto }) {
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
  const cols = device === "phone" ? (g.size === "large" ? 1 : 2) : g.size === "large" ? 2 : 3;
  const gap = g.spacing === "large" ? 14 : 4;
  return (
    <div className={`gp gp-${device}`} style={{ background: pal[1], color: pal[3] }}>
      {coverEl}
      <div className="gp-nav" style={{ borderColor: pal[2] }}><b style={titleStyle}>{title}</b><span>{studioName}</span><span className="gp-sets">{d.sets.map((s) => <i key={s.id}>{s.name}</i>)}</span></div>
      {photos.length ? (
        g.style === "horizontal"
          ? <div className="gp-rows" style={{ gap, padding: gap }}>{(full ? photos : photos.slice(0, 18)).map((p, i) => <img key={p.id || p.path} onClick={onPhoto ? () => onPhoto(i) : undefined} src={publicUrl(p.path)} alt="" style={{ height: device === "phone" ? 80 : g.size === "large" ? 180 : 120 }} loading="lazy" />)}</div>
          : <div className="gp-masonry" style={{ columnCount: cols, columnGap: gap, padding: gap }}>{(full ? photos : photos.slice(0, 24)).map((p, i) => <img key={p.id || p.path} onClick={onPhoto ? () => onPhoto(i) : undefined} src={publicUrl(p.path)} alt="" style={{ marginBottom: gap }} loading="lazy" />)}</div>
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
  const { galleries, studio, client, update, remove, reload } = useData();
  const toast = useToast();
  const g = galleries.find((x) => x.id === id);
  const [tab, setTab] = useState("photos");
  const [sub, setSub] = useState({ photos: "highlights", design: "cover", settings: "general", share: "invite", activity: "downloads" });
  const [photos, setPhotos] = useState([]);
  const [uploading, setUploading] = useState(null);
  const [over, setOver] = useState(false);
  const [setModal, setSetModal] = useState(null); // {id?, name, description}
  const [device, setDevice] = useState("desktop");
  const [preview, setPreview] = useState(false);
  const fileRef = useRef(null);
  const [d, setD, status, flush] = useAutosave(g ? toDraft(g) : null, async (v) => {
    await update("galleries", id, { title: v.title.trim() || tx("Untitled gallery"), event_date: v.event_date || null, expires_on: v.expires_on || null, slug: slugify(v.slug) || null, sets: v.sets, cover_path: v.cover_path || null, design: v.design, settings: v.settings, updated_at: new Date().toISOString() });
  });

  const loadPhotos = useCallback(async () => {
    const { data } = await supabase.from("gallery_photos").select("*").eq("gallery_id", id).order("position", { ascending: true });
    setPhotos(data || []);
  }, [id]);
  useEffect(() => { loadPhotos(); }, [loadPhotos]);
  useEffect(() => {
    const h = (e) => { if (e.key === "Escape" && !setModal && !preview) { flush(); onClose(); } };
    document.addEventListener("keydown", h);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", h); document.body.style.overflow = ""; };
  }, [flush, onClose, setModal, preview]);

  const setPhotosInSet = useMemo(() => photos.filter((p) => p.set_id === sub.photos), [photos, sub.photos]);
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

  async function upload(files) {
    const list = [...files].filter((f) => /^image\//.test(f.type));
    if (!list.length) return toast(tx("Add JPG, PNG, WebP or HEIC photos."));
    setUploading({ done: 0, total: list.length });
    let pos = photos.length;
    for (const file of list) {
      try {
        const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
        const path = `${studio.id}/${id}/${crypto.randomUUID ? crypto.randomUUID() : uid() + uid()}.${ext}`;
        let width = null, height = null;
        try { const bmp = await createImageBitmap(file); width = bmp.width; height = bmp.height; bmp.close?.(); } catch { /* HEIC may not decode in the browser */ }
        const { error } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type, cacheControl: "31536000" });
        if (error) throw error;
        const { error: e2 } = await supabase.from("gallery_photos").insert({ studio_id: studio.id, gallery_id: id, set_id: currentSet.id, path, name: file.name, width, height, position: pos++ });
        if (e2) throw e2;
      } catch (e) { toast(tx("Couldn't upload {name}: {err}", { name: file.name, err: e.message })); }
      setUploading((u) => ({ ...u, done: u.done + 1 }));
    }
    await loadPhotos();
    const { count } = await supabase.from("gallery_photos").select("id", { count: "exact", head: true }).eq("gallery_id", id);
    await update("galleries", id, { photo_count: count ?? pos });
    setUploading(null);
    toast(txn(list.length, "{n} photo added", "{n} photos added"));
  }
  async function deletePhoto(p) {
    if (!window.confirm(tx("Remove this photo from the gallery?"))) return;
    await supabase.storage.from(BUCKET).remove([p.path]);
    await supabase.from("gallery_photos").delete().eq("id", p.id);
    if (d.cover_path === p.path) set("cover_path", "");
    await loadPhotos();
    await update("galleries", id, { photo_count: Math.max(0, photos.length - 1) });
  }
  async function movePhoto(p, setId) {
    await supabase.from("gallery_photos").update({ set_id: setId }).eq("id", p.id);
    await loadPhotos();
    toast(tx("Moved to {name}", { name: d.sets.find((s) => s.id === setId)?.name }));
  }
  async function publish(next) {
    await flush();
    await update("galleries", id, next ? { status: "delivered", expires_on: d.expires_on || addDays(60) } : { status: "draft" });
    if (next && !d.expires_on) set("expires_on", addDays(60));
    toast(next ? tx("Gallery published") : tx("Gallery moved back to draft"), next);
  }
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
          {!published ? <button type="button" className="btn btn-primary btn-sm" onClick={() => publish(true)}><Icon name="send" />{tx("Publish")}</button>
            : <span className="pill p-success">{tx("Live")}</span>}
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
                    <button type="button" className="btn btn-primary btn-sm" onClick={() => fileRef.current?.click()} disabled={!!uploading}><Icon name="plus" />{tx("Add photos")}</button>
                    <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => { upload(e.target.files); e.target.value = ""; }} /></div>
                  {uploading && <div className="ge-progress" role="status"><span style={{ width: `${(uploading.done / uploading.total) * 100}%` }} /><b>{tx("Uploading {a} of {b}…", { a: Math.min(uploading.done + 1, uploading.total), b: uploading.total })}</b></div>}
                  <div className={`ge-drop ${over ? "on" : ""} ${setPhotosInSet.length ? "has" : ""}`} onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={(e) => { e.preventDefault(); setOver(false); upload(e.dataTransfer.files); }}>
                    {setPhotosInSet.length ? (
                      <div className="ge-grid">
                        {setPhotosInSet.map((p) => (
                          <figure key={p.id} className={`ge-photo ${d.cover_path === p.path ? "is-cover" : ""}`}>
                            <img src={publicUrl(p.path)} alt={p.name} loading="lazy" />
                            {d.cover_path === p.path && <span className="ge-badge">{tx("Cover")}</span>}
                            <figcaption>
                              <button type="button" onClick={() => set("cover_path", p.path)} title={tx("Set as cover")} aria-label={tx("Set as cover")}><Icon name="star" /></button>
                              {d.sets.length > 1 && <select value={p.set_id} onChange={(e) => movePhoto(p, e.target.value)} aria-label={tx("Move to set")}>{d.sets.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>}
                              <button type="button" onClick={() => deletePhoto(p)} title={tx("Remove")} aria-label={tx("Remove photo")}><Icon name="x" /></button>
                            </figcaption>
                          </figure>
                        ))}
                      </div>
                    ) : (
                      <div className="ge-empty">
                        <Icon name="image" />
                        <b>{tx("Drag photos here to upload")}</b>
                        <span className="sub">{tx("or")}</span>
                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => fileRef.current?.click()}>{tx("Choose from your computer")}</button>
                        <span className="sub" style={{ fontSize: 12 }}>{tx("JPG, PNG, WebP or HEIC · up to 50 MB each")}</span>
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
                  <div className="ge-empty ge-activity">
                    <Icon name={sub.activity === "downloads" ? "download" : "heart"} />
                    <b>{sub.activity === "downloads" ? txn(g.downloads || 0, "{n} download so far", "{n} downloads so far") : txn(g.favourites || 0, "{n} favourite so far", "{n} favourites so far")}</b>
                    <span className="sub">{sub.activity === "downloads" ? tx("Who downloaded what shows here once your client opens the gallery.") : tx("Your client's hearts and notes show here as they pick.")}</span>
                  </div></>
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
