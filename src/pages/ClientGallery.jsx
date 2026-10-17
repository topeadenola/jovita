import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "../supabase";
import { GalleryPreview, publicUrl } from "../components/GalleryEditor";
import StudioLogo from "../components/StudioLogo";
import Icon from "../components/Icon";
import { tx } from "../lib/i18n";
import { LangSwitch } from "../components/Lang";

const DEF_DESIGN = { cover: "center", font: "sans", palette: "light", grid: { style: "vertical", size: "regular", spacing: "regular" } };

// What a client (or anyone you invited) sees at /g/<link>. Opening it records the view for that person.
export default function ClientGallery() {
  const { token } = useParams();
  const [state, setState] = useState({ loading: true });
  const [pw, setPw] = useState("");
  const [setId, setSetId] = useState("all");
  const [open, setOpen] = useState(-1);

  const load = useCallback(async (password) => {
    setState((s) => ({ ...s, loading: true }));
    const { data, error } = await supabase.rpc("open_gallery", { p_token: token, p_password: password || null });
    if (error) return setState({ error: "missing" });
    if (!data) return setState({ error: "missing" });
    if (data.error) return setState({ error: data.error, title: data.title, tried: !!password });
    setState({ g: data });
  }, [token]);
  useEffect(() => { load(); }, [load]);

  const g = state.g;
  const d = useMemo(() => g && ({
    title: g.title, event_date: g.event_date, cover_path: g.cover_path,
    sets: Array.isArray(g.sets) && g.sets.length ? g.sets : [{ id: "highlights", name: tx("Highlights") }],
    design: { ...DEF_DESIGN, ...(g.design || {}), grid: { ...DEF_DESIGN.grid, ...(g.design?.grid || {}) } },
  }), [g]);
  const photos = useMemo(() => (g?.photos || []).filter((p) => setId === "all" || p.set_id === setId), [g, setId]);

  useEffect(() => {
    if (open < 0) return;
    const h = (e) => {
      if (e.key === "Escape") setOpen(-1);
      if (e.key === "ArrowRight") setOpen((i) => Math.min(photos.length - 1, i + 1));
      if (e.key === "ArrowLeft") setOpen((i) => Math.max(0, i - 1));
    };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [open, photos.length]);

  if (state.loading && !g) return <div className="loading">{tx("Opening the gallery…")}</div>;
  if (state.error === "password") return (
    <div className="cg-gate">
      <form className="card" onSubmit={(e) => { e.preventDefault(); load(pw); }}>
        <Icon name="lock" />
        <h1 className="h-m">{state.title}</h1>
        <p className="sub">{tx("This gallery has a password. Your photographer sent it with the link.")}</p>
        <div className="field"><label htmlFor="cg-pw">{tx("Password")}</label><input id="cg-pw" autoFocus value={pw} onChange={(e) => setPw(e.target.value)} /></div>
        {state.tried && <p className="err">{tx("That password didn't work. Check it and try again.")}</p>}
        <button className="btn btn-primary">{tx("Open gallery")}</button>
      </form>
    </div>
  );
  if (state.error) return (
    <div className="cg-gate"><div className="card"><Icon name="image" />
      <h1 className="h-m">{state.error === "expired" ? tx("This gallery has expired") : state.error === "not_published" ? tx("This gallery isn't ready yet") : tx("We couldn't find this gallery")}</h1>
      <p className="sub">{state.error === "expired" ? tx("Ask your photographer to extend it.") : state.error === "not_published" ? tx("Your photographer is still working on it. Check back soon.") : tx("Check the link, or ask your photographer for a new one.")}</p>
    </div></div>
  );

  const dl = g.download || {};
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
      <GalleryPreview d={d} photos={photos} studioName={g.studio?.name} device={window.innerWidth < 700 ? "phone" : "desktop"} full onPhoto={setOpen} />
      {cur && (
        <div className="cg-light" role="dialog" aria-modal="true" aria-label={tx("Photo {n} of {total}", { n: open + 1, total: photos.length })} onClick={(e) => e.target === e.currentTarget && setOpen(-1)}>
          <img src={publicUrl(cur.path)} alt="" />
          <button type="button" className="cg-x" onClick={() => setOpen(-1)} aria-label={tx("Close")}><Icon name="x" /></button>
          {open > 0 && <button type="button" className="cg-prev" onClick={() => setOpen(open - 1)} aria-label={tx("Previous photo")}>‹</button>}
          {open < photos.length - 1 && <button type="button" className="cg-next" onClick={() => setOpen(open + 1)} aria-label={tx("Next photo")}>›</button>}
          {dl.on && <a className="btn btn-secondary btn-sm cg-dl" href={publicUrl(cur.path)} target="_blank" rel="noreferrer" download><Icon name="download" />{tx("Download")}</a>}
        </div>
      )}
    </div>
  );
}
