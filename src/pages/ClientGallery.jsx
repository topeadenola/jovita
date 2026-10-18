import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "../supabase";
import { GalleryPreview, downloadUrl, isRaw, isVideo, publicUrl, thumbUrl } from "../components/GalleryEditor";
import StudioLogo from "../components/StudioLogo";
import Icon, { Mark } from "../components/Icon";
import { tx, txn } from "../lib/i18n";
import { fdate } from "../lib/format";
import { LangSwitch } from "../components/Lang";

// Who's viewing: the invited email, or a private id kept in this browser
const VKEY = "jv-viewer";
const readLS = (k) => { try { return localStorage.getItem(k) || ""; } catch { return ""; } };
const writeLS = (k, v) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } };
function viewerId(g) {
  if (g?.viewer?.email) return String(g.viewer.email).toLowerCase();
  let v = readLS(VKEY);
  if (!v) { v = "v-" + (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now()); writeLS(VKEY, v); }
  return v;
}

const DEF_DESIGN = { cover: "center", font: "sans", palette: "light", grid: { style: "vertical", size: "regular", spacing: "regular" } };

// What a client (or anyone you invited) sees at /g/<link>. Opening it records the view for that person.
export default function ClientGallery() {
  const { token } = useParams();
  const [state, setState] = useState({ loading: true });
  const [, setW] = useState(0);
  useEffect(() => { const f = () => setW(window.innerWidth); window.addEventListener("resize", f); return () => window.removeEventListener("resize", f); }, []);
  const [pw, setPw] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [setId, setSetId] = useState("all");
  const [open, setOpen] = useState(-1);
  const [pass, setPass] = useState("");          // the password that opened it, for hearts and notes
  const [mine, setMine] = useState(new Set());   // my favourites
  const [notes, setNotes] = useState([]);
  const [onlyFavs, setOnlyFavs] = useState(false);
  const [name, setName] = useState(readLS("jv-viewer-name"));
  const [ask, setAsk] = useState(null);          // waiting for a name before saving a heart or note
  const [note, setNote] = useState("");
  const [panel, setPanel] = useState(false);
  const [pin, setPin] = useState(() => readLS("jv-gpin-" + token));
  const [pinAsk, setPinAsk] = useState(null);     // waiting for the download PIN
  const [zipping, setZipping] = useState(null);   // { done, total }

  const forget = useCallback(() => { try { localStorage.removeItem("jv-gpw-" + token); } catch { /* fine */ } }, [token]);
  const load = useCallback(async (password, tried = false) => {
    setState((s) => ({ ...s, loading: true }));
    const { data, error } = await supabase.rpc("open_gallery", { p_token: token, p_password: password || null });
    if (error) return setState({ error: "missing" });
    if (!data) return setState({ error: "missing" });
    if (data.error === "password" && password && !tried) { forget(); return load("", true); }
    if (data.error) return setState({ error: data.error, title: data.title, cover: data.cover_path, date: data.event_date, studio: data.studio, tried: !!password });
    // Remember the password on this device, so a refresh never asks again
    if (password) writeLS("jv-gpw-" + token, password);
    setPass(password || "");
    setState({ g: data });
  }, [token, forget]);
  useEffect(() => { load(readLS("jv-gpw-" + token) || undefined); }, [load, token]);

  const g = state.g;
  const d = useMemo(() => g && ({
    title: g.title, event_date: g.event_date, cover_path: g.cover_path,
    sets: Array.isArray(g.sets) && g.sets.length ? g.sets : [{ id: "highlights", name: tx("Highlights") }],
    design: { ...DEF_DESIGN, ...(g.design || {}), grid: { ...DEF_DESIGN.grid, ...(g.design?.grid || {}) } },
  }), [g]);
  const vid = useMemo(() => (g ? viewerId(g) : ""), [g]);
  const dl0 = g?.download || {};
  const favOn = g && g.favorite?.on !== false;
  const loadFeedback = useCallback(async () => {
    if (!g) return;
    const { data } = await supabase.rpc("gallery_feedback", { p_token: token, p_password: pass || null, p_viewer: vid });
    if (data) { setMine(new Set(data.favorites || [])); setNotes(data.comments || []); }
  }, [g, token, pass, vid]);
  useEffect(() => { loadFeedback(); }, [loadFeedback]);
  const photos = useMemo(() => (g?.photos || []).filter((p) => (setId === "all" || p.set_id === setId) && (!onlyFavs || mine.has(p.id))), [g, setId, onlyFavs, mine]);
  const noteCount = useMemo(() => notes.reduce((m, c) => ({ ...m, [c.photo_id]: (m[c.photo_id] || 0) + 1 }), {}), [notes]);
  const who = g?.viewer?.name || name;
  const needName = (fn) => (who ? fn(who) : setAsk(() => fn));
  const toggleFav = (p) => needName(async (nm) => {
    const was = mine.has(p.id);
    setMine((m) => { const n = new Set(m); was ? n.delete(p.id) : n.add(p.id); return n; });
    const { error } = await supabase.rpc("gallery_toggle_favorite", { p_token: token, p_password: pass || null, p_photo: p.id, p_viewer: vid, p_name: nm });
    if (error) { setMine((m) => { const n = new Set(m); was ? n.add(p.id) : n.delete(p.id); return n; }); window.alert?.(error.message); }
  });
  // Downloads: check they're allowed (and the PIN), record who downloaded what, then save the file(s)
  const clearance = async (args, pinTry, nm) => {
    const { data, error } = await supabase.rpc("gallery_log_download", { p_token: token, p_password: pass || null, p_pin: pinTry ?? pin ?? null, p_viewer: vid, p_name: nm || who || "", ...args });
    if (error) return "ok"; // before the update is run, don't block downloads
    return data;
  };
  const withPin = (args, go) => needName(async (nm) => {
    const res = await clearance(args, undefined, nm);
    if (res === "ok") return go();
    if (res === "pin") return setPinAsk(() => async (p2) => { const r2 = await clearance(args, p2, nm); if (r2 === "ok") { setPin(p2); writeLS("jv-gpin-" + token, p2); setPinAsk(null); go(); } else return tx("That PIN didn't work. Ask your photographer for it."); });
    window.alert?.(tx("Downloads are switched off for this gallery."));
  });
  const saveOne = (p) => withPin({ p_photo: p.id, p_kind: "photo", p_files: 1, p_label: p.name || "" }, () => {
    const a = document.createElement("a"); a.href = downloadUrl(p.path, p.name || undefined); a.download = p.name || ""; a.rel = "noopener";
    document.body.appendChild(a); a.click(); a.remove();
  });
  const saveZip = (list, label) => withPin({ p_photo: null, p_kind: "zip", p_files: list.length, p_label: label }, async () => {
    const { downloadZip } = await import("client-zip");
    const base = (d.title || "Gallery").replace(/[^\w\- ]+/g, "").trim() || "Gallery";
    const used = new Map();
    const uniq = (n) => { const k = n.toLowerCase(); const c = used.get(k) || 0; used.set(k, c + 1); return c ? n.replace(/(\.[^.]+)?$/, ` (${c})$1`) : n; };
    setZipping({ done: 0, total: list.length });
    async function* files() {
      let i = 0;
      for (const p of list) {
        const res = await fetch(publicUrl(p.path));
        if (res.ok) yield { name: uniq(p.name || `photo-${i + 1}.${String(p.path).split(".").pop()}`), input: res };
        setZipping({ done: ++i, total: list.length });
      }
    }
    try {
      const name = `${base}${label && label !== tx("All photos") ? " - " + label : ""}.zip`;
      if (window.showSaveFilePicker) {
        // Chrome/Edge: write straight to disk, so even very big galleries work
        let handle;
        try { handle = await window.showSaveFilePicker({ suggestedName: name, types: [{ description: "Zip", accept: { "application/zip": [".zip"] } }] }); } catch { setZipping(null); return; }
        await downloadZip(files()).body.pipeTo(await handle.createWritable());
      } else {
        const blob = await downloadZip(files()).blob();
        const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 60000);
      }
    } catch (e) { window.alert?.(tx("The download stopped: {err}", { err: e.message })); }
    setZipping(null);
  });
  const addNote = (p) => needName(async (nm) => {
    const body = note.trim(); if (!body) return;
    const { data, error } = await supabase.rpc("gallery_add_comment", { p_token: token, p_password: pass || null, p_photo: p.id, p_viewer: vid, p_name: nm, p_body: body });
    if (error) return;
    setNotes((n) => [...n, data]); setNote("");
  });

  useEffect(() => {
    if (open < 0) return;
    const h = (e) => {
      if (e.target.closest?.("input,textarea")) return;
      if (e.key === "Escape") setOpen(-1);
      if (e.key === "ArrowRight") setOpen((i) => Math.min(photos.length - 1, i + 1));
      if (e.key === "ArrowLeft") setOpen((i) => Math.max(0, i - 1));
    };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [open, photos.length]);

  if (state.loading && !g) return <div className="loading">{tx("Opening the gallery…")}</div>;
  if (state.error === "password") return (
    <div className="cg-lock" style={state.cover ? { "--cg-bg": `url("${publicUrl(state.cover)}")` } : undefined}>
      <form className="cg-lock-card" onSubmit={(e) => { e.preventDefault(); load(pw); }}>
        {state.studio && <div className="cg-lock-brand"><StudioLogo studio={state.studio} className="studio-mark" /><span>{state.studio.name}</span></div>}
        <span className="cg-lock-ic"><Icon name="lock" /></span>
        <h1>{state.title}</h1>
        {state.date && <p className="cg-lock-date">{fdate(state.date)}</p>}
        <p className="sub">{tx("This gallery is private. Enter the password your photographer sent you.")}</p>
        <div className="cg-lock-field">
          <input id="cg-pw" type={showPw ? "text" : "password"} autoFocus value={pw} onChange={(e) => setPw(e.target.value)} placeholder={tx("Password")} aria-label={tx("Password")} />
          <button type="button" onClick={() => setShowPw((v) => !v)} aria-label={showPw ? tx("Hide password") : tx("Show password")}><Icon name="eye" /></button>
        </div>
        {state.tried && <p className="err">{tx("That password didn't work. Check it and try again.")}</p>}
        <button className="btn btn-primary">{tx("View gallery")}</button>
      </form>
    </div>
  );
  if (state.error) return (
    <div className="cg-gate"><div className="card"><Icon name="image" />
      <h1 className="h-m">{state.error === "expired" ? tx("This gallery has expired") : state.error === "not_published" ? tx("This gallery isn't ready yet") : tx("We couldn't find this gallery")}</h1>
      <p className="sub">{state.error === "expired" ? tx("Ask your photographer to extend it.") : state.error === "not_published" ? tx("Your photographer is still working on it. Check back soon.") : tx("Check the link, or ask your photographer for a new one.")}</p>
    </div></div>
  );

  const dl = dl0;
  const cur = photos[open];
  return (
    <div className="cg">
      <header className="cg-bar">
        <StudioLogo studio={g.studio} className="studio-mark" /><b>{g.studio?.name}</b>
        <span className="spacer" />
        {g.viewer?.name && <span className="sub">{tx("Hi {name}", { name: g.viewer.name })}</span>}
        <LangSwitch />
      </header>
      {d.sets.length > 1 && (
        <nav className="cg-sets" aria-label={tx("Photo sets")}>
          <button type="button" aria-pressed={setId === "all"} onClick={() => setSetId("all")}>{tx("All")}</button>
          {d.sets.map((s) => <button key={s.id} type="button" aria-pressed={setId === s.id} onClick={() => setSetId(s.id)}>{s.name}</button>)}
        </nav>
      )}
      {(favOn || dl0.on) && (
        <div className="cg-tools">
          {dl0.on && <button type="button" disabled={!!zipping} onClick={() => saveZip(g.photos || [], tx("All photos"))}><Icon name="download" />{zipping ? tx("Preparing {a} of {b}…", { a: zipping.done, b: zipping.total }) : tx("Download all ({n})", { n: (g.photos || []).length })}</button>}
          {dl0.on && setId !== "all" && !zipping && <button type="button" onClick={() => saveZip(photos, d.sets.find((x) => x.id === setId)?.name || "")}><Icon name="download" />{tx("Download this set")}</button>}
          {dl0.on && onlyFavs && mine.size > 0 && !zipping && <button type="button" onClick={() => saveZip((g.photos || []).filter((p) => mine.has(p.id)), tx("My favourites"))}><Icon name="download" />{tx("Download my favourites")}</button>}
          {favOn && <button type="button" aria-pressed={onlyFavs} onClick={() => setOnlyFavs(!onlyFavs)}><Icon name="heart" />{onlyFavs ? tx("Show all photos") : tx("My favourites ({n})", { n: mine.size })}</button>}
          {favOn && <span className="sub" style={{ fontSize: 13 }}>{tx("Tap the heart to pick your favourites. Open a photo to leave a note for your photographer.")}</span>}
        </div>
      )}
      <GalleryPreview d={d} photos={photos} studioName={g.studio?.name} device={window.innerWidth < 700 ? "phone" : "desktop"} full onPhoto={setOpen}
        favs={mine} onFav={favOn ? toggleFav : undefined} notes={noteCount} />
      {onlyFavs && !photos.length && <p className="gp-empty">{tx("No favourites yet. Tap the heart on the photos you love.")}</p>}
      {g.studio && g.studio.branded === false && <p className="cg-made"><a href="https://getjovita.com" target="_blank" rel="noreferrer">{tx("Made with")} <Mark dot="currentColor" style={{ width: 9, height: 13 }} /> jovita</a></p>}
      {cur && (
        <div className="cg-light cg-view" role="dialog" aria-modal="true" aria-label={tx("Photo {n} of {total}", { n: open + 1, total: photos.length })} onClick={(e) => e.target === e.currentTarget && setOpen(-1)}>
          {isVideo(cur.path) ? <video key={cur.path} src={publicUrl(cur.path)} controls autoPlay playsInline poster={thumbUrl(cur.path)} />
            : isRaw(cur.path) ? <img src={thumbUrl(cur.path)} alt={cur.name || ""} /> : <img src={publicUrl(cur.path)} alt={cur.name || ""} />}
          {panel && (
            <aside className="lb-notes" onClick={(e) => e.stopPropagation()}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}><b className="lb-file">{cur.name || tx("Photo {n}", { n: open + 1 })}</b><button type="button" className="x" onClick={() => setPanel(false)} aria-label={tx("Close notes")}><Icon name="x" /></button></div>
              <div className="lb-thread">
                {notes.filter((c) => c.photo_id === cur.id).map((c) => <div key={c.id} className={`lb-note ${c.from_client ? "me" : ""}`}><small>{c.from_client ? (c.author || tx("You")) : g.studio?.name}</small>{c.body}</div>)}
                {!notes.some((c) => c.photo_id === cur.id) && <p className="sub" style={{ fontSize: 13 }}>{tx("Tell your photographer what you'd like changed on this photo, e.g. \"please brighten it a little\".")}</p>}
              </div>
              <form className="lb-reply" onSubmit={(e) => { e.preventDefault(); addNote(cur); }}>
                <input value={note} onChange={(e) => setNote(e.target.value)} placeholder={tx("Write a note…")} aria-label={tx("Write a note")} maxLength={2000} />
                <button className="btn btn-primary btn-sm" disabled={!note.trim()}><Icon name="send" /></button>
              </form>
            </aside>
          )}
          <button type="button" className="cg-x" onClick={() => setOpen(-1)} aria-label={tx("Close")}><Icon name="x" /></button>
          {open > 0 && <button type="button" className="cg-prev" onClick={() => setOpen(open - 1)} aria-label={tx("Previous photo")}>‹</button>}
          {open < photos.length - 1 && <button type="button" className="cg-next" onClick={() => setOpen(open + 1)} aria-label={tx("Next photo")}>›</button>}
          <div className="cg-lb-tools" onClick={(e) => e.stopPropagation()}>
            <span className="cg-lb-name">{cur.name ? <b>{cur.name}</b> : null}<small>{open + 1} / {photos.length}</small></span>
            {favOn && <button type="button" className="btn btn-secondary btn-sm" aria-pressed={mine.has(cur.id)} onClick={() => toggleFav(cur)}><Icon name="heart" />{mine.has(cur.id) ? tx("Favourite") : tx("Add to favourites")}</button>}
            <button type="button" className="btn btn-secondary btn-sm" aria-pressed={panel} onClick={() => setPanel(!panel)}><Icon name="chat" />{noteCount[cur.id] ? tx("Notes ({n})", { n: noteCount[cur.id] }) : tx("Leave a note")}</button>
            {dl.on && <button type="button" className="btn btn-secondary btn-sm" onClick={() => saveOne(cur)}><Icon name="download" />{tx("Download")}</button>}
          </div>
        </div>
      )}
      {pinAsk && <PinAsk studio={g.studio?.name} onClose={() => setPinAsk(null)} onTry={pinAsk} />}
      {ask && (
        <div className="scrim modal-wrap" style={{ zIndex: 90 }} onMouseDown={(e) => e.target === e.currentTarget && setAsk(null)}>
          <form className="modal" role="dialog" aria-modal="true" aria-label={tx("Your name")} onSubmit={(e) => { e.preventDefault(); const n = name.trim(); if (!n) return; writeLS("jv-viewer-name", n); const fn = ask; setAsk(null); fn(n); }}>
            <h2 className="h-m">{tx("What's your name?")}</h2>
            <p className="sub" style={{ fontSize: 14 }}>{tx("So {studio} knows whose picks and notes these are.", { studio: g.studio?.name || tx("your photographer") })}</p>
            <div className="field"><label htmlFor="cg-name">{tx("Your name")}</label><input id="cg-name" autoFocus value={name} onChange={(e) => setName(e.target.value)} maxLength={80} /></div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}><button type="button" className="btn btn-ghost" onClick={() => setAsk(null)}>{tx("Cancel")}</button><button className="btn btn-primary">{tx("Continue")}</button></div>
          </form>
        </div>
      )}
    </div>
  );
}

function PinAsk({ studio, onClose, onTry }) {
  const [v, setV] = useState("");
  const [err, setErr] = useState("");
  return (
    <div className="scrim modal-wrap" style={{ zIndex: 90 }} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="modal" role="dialog" aria-modal="true" aria-label={tx("Download PIN")} onSubmit={async (e) => { e.preventDefault(); const m = await onTry(v.trim()); if (m) setErr(m); }}>
        <h2 className="h-m">{tx("Enter the download PIN")}</h2>
        <p className="sub" style={{ fontSize: 14 }}>{tx("{studio} sent you a 4-digit PIN for downloads.", { studio: studio || tx("Your photographer") })}</p>
        <div className="field"><label htmlFor="cg-pin">{tx("PIN")}</label><input id="cg-pin" inputMode="numeric" autoFocus maxLength={8} value={v} onChange={(e) => setV(e.target.value)} /></div>
        {err && <p className="err">{err}</p>}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}><button type="button" className="btn btn-ghost" onClick={onClose}>{tx("Cancel")}</button><button className="btn btn-primary">{tx("Download")}</button></div>
      </form>
    </div>
  );
}
