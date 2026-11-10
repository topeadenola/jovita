// Spotlight: Creative of the week, featured projects and stories from the Jovita community.
// Public: anyone can read it, signed in or not.
import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "../supabase";
import { Mark } from "../components/Icon";
import Icon from "../components/Icon";
import { LangSwitch } from "../components/Lang";
import { locale, tx } from "../lib/i18n";
import { cleanHtml, isHtml } from "../lib/richtext";

export const spotUrl = (path) => (!path ? "" : /^https?:|^\//.test(path) ? path : supabase.storage.from("spotlight").getPublicUrl(path).data.publicUrl);
// Pictures inside a story must be ones uploaded to Spotlight
const IMG_BASE = supabase.storage.from("spotlight").getPublicUrl("x").data.publicUrl.slice(0, -1);
const imgOk = (src) => src.startsWith(IMG_BASE);
const HOME = "https://getjovita.com";
const KIND = { creative_of_week: "Creative of the week", feature: "Featured project", story: "Story" };
const day = (iso) => (iso ? new Date(iso).toLocaleDateString(locale(), { day: "numeric", month: "long", year: "numeric" }) : "");
const insta = (h) => (h ? `https://instagram.com/${h.replace(/^@/, "").replace(/^https?:\/\/(www\.)?instagram\.com\//, "")}` : "");

function useSession() {
  const [s, setS] = useState(null);
  useEffect(() => { supabase.auth.getSession().then(({ data }) => setS(data.session || null)).catch(() => {}); }, []);
  return s;
}

function Bar() {
  const session = useSession();
  return (
    <header className="sp-bar">
      <Link to="/spotlight" className="sp-brand"><Mark dot="#261433" /><b>{tx("jovita")}</b><span>{tx("Spotlight")}</span></Link>
      <span className="spacer" />
      <LangSwitch compact />
      {session ? <Link className="btn btn-secondary btn-sm" to="/"><Icon name="arrow" className="ic flip" />{tx("Back to my studio")}</Link>
        : <><a className="btn btn-ghost btn-sm sp-home" href={HOME}><Icon name="arrow" className="ic flip" />{tx("Jovita home")}</a><Link className="btn btn-joy btn-sm" to="/signup">{tx("Try Jovita free")}</Link></>}
    </header>
  );
}

export function Card({ p }) {
  return (
    <Link to={`/spotlight/${p.slug}`} className="sp-card">
      <span className="sp-img" style={{ backgroundImage: p.cover_path ? `url("${spotUrl(p.cover_path)}")` : undefined }}>
        <span className={`sp-tag k-${p.kind}`}>{p.kind === "creative_of_week" && <Icon name="star" />}{tx(KIND[p.kind] || "Story")}</span>
      </span>
      <span className="sp-meta">
        <b>{p.title}</b>
        <span>{[p.person_name, tx(p.person_role || ""), p.location].filter(Boolean).join(" · ") || day(p.published_at)}</span>
      </span>
    </Link>
  );
}

export function usePosts() {
  const [posts, setPosts] = useState(null);
  useEffect(() => {
    supabase.from("spotlights").select("id,slug,kind,title,dek,person_name,person_role,location,cover_path,published_at").eq("published", true).order("published_at", { ascending: false }).limit(60)
      .then(({ data }) => setPosts(data || [])).catch(() => setPosts([]));
  }, []);
  return posts;
}

export function SpotlightList() {
  const posts = usePosts();
  useEffect(() => { document.title = tx("Spotlight · Jovita"); }, []);
  const [kind, setKind] = useState("all");
  // One grid: this week's creative first, then newest first. The tag on each card says what it is.
  const week = posts?.find((p) => p.kind === "creative_of_week");
  const all = week ? [week, ...posts.filter((p) => p !== week)] : posts || [];
  const kinds = Object.keys(KIND).filter((k) => all.some((p) => p.kind === k));
  const shown = kind === "all" ? all : all.filter((p) => p.kind === kind);
  return (
    <div className="sp">
      <Bar />
      <main className="sp-main">
        <div className="sp-head">
          <p className="eyebrow">{tx("Spotlight")}</p>
          <h1>{tx("Work we love, from creatives like you.")}</h1>
          <p className="sub">{tx("A Creative of the week, featured projects and stories from photographers, videographers, makeup artists and creators around the world.")}</p>
        </div>
        {posts === null ? <div className="loading" style={{ minHeight: 300 }}>{tx("Loading…")}</div> : !posts.length ? (
          <div className="empty" style={{ padding: 60 }}><b>{tx("The first stories are on their way")}</b><span>{tx("Check back soon.")}</span></div>
        ) : (
          <section className="sp-sec">
            {kinds.length > 1 && (
              <div className="seg sp-filter" role="group" aria-label={tx("Show")}>
                {[["all", "All"], ...kinds.map((k) => [k, KIND[k]])].map(([k, label]) => (
                  <button key={k} type="button" aria-pressed={kind === k} onClick={() => setKind(k)}>{tx(label)}</button>
                ))}
              </div>
            )}
            <div className="sp-grid">{shown.map((p) => <Card key={p.id} p={p} />)}</div>
          </section>
        )}
      </main>
      <Foot />
    </div>
  );
}

function Foot() {
  return (
    <footer className="sp-foot">
      <span><Mark dot="#FBF8FF" /> {tx("Spotlight is made by the Jovita team.")}</span>
      <Link to="/signup">{tx("Run your creative business with Jovita")} <Icon name="arrow" /></Link>
    </footer>
  );
}

// Plain text with a little formatting (older stories): a blank line starts a new paragraph,
// "## " starts a heading line, "> " a pull quote.
function bodyBlocks(text = "") {
  const out = [];
  text.split(/\n\s*\n/).forEach((block, i) => {
    const lines = block.split("\n");
    let para = [];
    const flush = (k) => { if (para.length) { out.push(<p key={`${i}-${k}`}>{para.join(" ")}</p>); para = []; } };
    lines.forEach((ln, j) => {
      if (ln.startsWith("## ")) { flush(j); out.push(<h2 key={`${i}-${j}h`}>{ln.slice(3)}</h2>); }
      else if (ln.startsWith("> ")) { flush(j); out.push(<blockquote key={`${i}-${j}q`}>{ln.slice(2)}</blockquote>); }
      else if (ln.trim()) para.push(ln.trim());
    });
    flush("e");
  });
  return out;
}

// The story. Newer ones are formatted text (headings, lists, tables, pictures, picture strips): it is cleaned against
// a fixed list of allowed tags right here before it is shown, whatever is stored. Wide tables scroll sideways.
function Body({ body }) {
  const html = useMemo(() => {
    if (!isHtml(body)) return null;
    const d = document.createElement("div");
    d.innerHTML = cleanHtml(body, imgOk);
    d.querySelectorAll("table").forEach((t) => { const w = document.createElement("div"); w.className = "sp-table"; t.replaceWith(w); w.appendChild(t); });
    // Picture strips get left / right arrows (on a phone you just swipe)
    d.querySelectorAll(".sp-strip").forEach((st) => {
      const w = document.createElement("div"); w.className = "sp-strip-wrap"; st.replaceWith(w); w.appendChild(st);
      ["prev", "next"].forEach((dir) => { const b = document.createElement("button"); b.type = "button"; b.className = `sp-strip-btn ${dir}`; b.setAttribute("data-dir", dir); b.setAttribute("aria-label", dir === "prev" ? tx("Previous pictures") : tx("Next pictures")); b.textContent = dir === "prev" ? "‹" : "›"; w.appendChild(b); });
    });
    return d.innerHTML;
  }, [body]);
  if (html === null) return <div className="sp-body">{bodyBlocks(body)}</div>;
  const arrows = (e) => {
    const b = e.target.closest(".sp-strip-btn"); if (!b) return;
    const st = b.parentElement.querySelector(".sp-strip");
    st.scrollBy({ left: (b.dataset.dir === "prev" ? -1 : 1) * st.clientWidth * 0.8, behavior: "smooth" });
  };
  return <div className="sp-body" onClick={arrows} dangerouslySetInnerHTML={{ __html: html }} />;
}

export function SpotlightPost() {
  const { slug } = useParams();
  const [p, setP] = useState(undefined);
  const [open, setOpen] = useState(-1);
  const [copied, setCopied] = useState(false);
  const posts = usePosts();
  useEffect(() => {
    setP(undefined); window.scrollTo(0, 0);
    supabase.from("spotlights").select("*").eq("slug", slug).eq("published", true).maybeSingle().then(({ data }) => setP(data || null)).catch(() => setP(null));
  }, [slug]);
  useEffect(() => { if (p) document.title = `${p.title} · ${tx("Spotlight")}`; }, [p]);
  const photos = useMemo(() => (Array.isArray(p?.photos) ? p.photos : []), [p]);
  useEffect(() => {
    if (open < 0) return;
    const h = (e) => { if (e.key === "Escape") setOpen(-1); if (e.key === "ArrowRight") setOpen((i) => Math.min(photos.length - 1, i + 1)); if (e.key === "ArrowLeft") setOpen((i) => Math.max(0, i - 1)); };
    document.addEventListener("keydown", h); return () => document.removeEventListener("keydown", h);
  }, [open, photos.length]);
  const share = async () => { try { if (navigator.share) await navigator.share({ title: p.title, url: location.href }); else { await navigator.clipboard.writeText(location.href); setCopied(true); setTimeout(() => setCopied(false), 2000); } } catch { /* cancelled */ } };

  if (p === undefined) return <div className="sp"><Bar /><div className="loading" style={{ minHeight: 400 }}>{tx("Loading…")}</div></div>;
  if (!p) return <div className="sp"><Bar /><div className="empty" style={{ padding: 80 }}><b>{tx("We couldn't find that story")}</b><Link to="/spotlight" className="btn btn-secondary">{tx("See all of Spotlight")}</Link></div></div>;
  const more = (posts || []).filter((x) => x.slug !== p.slug).slice(0, 4);
  return (
    <div className="sp">
      <Bar />
      <article className="sp-post">
        <Link to="/spotlight" className="btn btn-ghost btn-sm sp-back"><Icon name="arrow" className="ic flip" />{tx("All of Spotlight")}</Link>
        <div className="sp-cover" style={{ backgroundImage: p.cover_path ? `url("${spotUrl(p.cover_path)}")` : undefined }} />
        <div className="sp-post-head">
          <span className="pill p-joy">{p.kind === "creative_of_week" && <Icon name="star" />}{tx(KIND[p.kind] || "Story")}</span>
          <h1>{p.title}</h1>
          {p.dek && <p className="sp-dek">{p.dek}</p>}
          <div className="sp-by">
            <div>{p.person_name ? <><b>{p.person_name}</b><span>{[tx(p.person_role || ""), p.location].filter(Boolean).join(" · ")}</span></> : <b>{tx("Jovita team")}</b>}</div>
            <span className="spacer" />
            {p.instagram && <a className="btn btn-secondary btn-sm" href={insta(p.instagram)} target="_blank" rel="noreferrer">Instagram</a>}
            {p.website && <a className="btn btn-secondary btn-sm" href={/^https?:/.test(p.website) ? p.website : `https://${p.website}`} target="_blank" rel="noreferrer">{tx("Website")}</a>}
            {photos.length > 0 && <a className="btn btn-secondary btn-sm" href="#their-work">{tx("See their work ({n})", { n: photos.length })}</a>}
            <button type="button" className="btn btn-ghost btn-sm" onClick={share}><Icon name="link" />{copied ? tx("Link copied") : tx("Share")}</button>
          </div>
          <small className="sub">{day(p.published_at)}</small>
        </div>
        <Body body={p.body} />
        {photos.length > 0 && <h2 className="sp-work-h" id="their-work">{p.person_name ? tx("{name}'s work", { name: p.person_name.split(" ")[0] }) : tx("Their work")}</h2>}
        {photos.length > 0 && (
          <div className="sp-photos">{photos.map((ph, i) => (
            <figure key={i}><button type="button" onClick={() => setOpen(i)} aria-label={tx("Open photo {n}", { n: i + 1 })}><img src={spotUrl(ph.path)} alt={ph.caption || ""} loading="lazy" /></button>{ph.caption && <figcaption>{ph.caption}</figcaption>}</figure>
          ))}</div>
        )}
      </article>
      {more.length > 0 && <section className="sp-sec sp-more"><div className="sp-more-head"><h2>{tx("More from Spotlight")}</h2><Link to="/spotlight" className="btn btn-secondary btn-sm">{tx("See all of Spotlight")}</Link></div><div className="sp-grid">{more.map((x) => <Card key={x.id} p={x} />)}</div></section>}
      {!more.length && <p style={{ textAlign: "center", marginTop: 40 }}><Link to="/spotlight" className="btn btn-secondary">{tx("See all of Spotlight")}</Link></p>}
      <Foot />
      {open >= 0 && photos[open] && (
        <div className="cg-light" role="dialog" aria-modal="true" aria-label={tx("Photo {n} of {total}", { n: open + 1, total: photos.length })} onClick={(e) => e.target === e.currentTarget && setOpen(-1)}>
          <img src={spotUrl(photos[open].path)} alt={photos[open].caption || ""} />
          <button type="button" className="cg-x" onClick={() => setOpen(-1)} aria-label={tx("Close")}><Icon name="x" /></button>
          {open > 0 && <button type="button" className="cg-prev" onClick={() => setOpen(open - 1)} aria-label={tx("Previous photo")}>‹</button>}
          {open < photos.length - 1 && <button type="button" className="cg-next" onClick={() => setOpen(open + 1)} aria-label={tx("Next photo")}>›</button>}
        </div>
      )}
    </div>
  );
}
