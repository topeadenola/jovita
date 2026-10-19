// Spotlight: Creative of the week, featured projects and stories from the Jovita community.
// Public: anyone can read it, signed in or not.
import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "../supabase";
import { Mark } from "../components/Icon";
import Icon from "../components/Icon";
import { LangSwitch } from "../components/Lang";
import { locale, tx } from "../lib/i18n";

export const spotUrl = (path) => (!path ? "" : /^https?:|^\//.test(path) ? path : supabase.storage.from("spotlight").getPublicUrl(path).data.publicUrl);
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
      {session ? <Link className="btn btn-secondary btn-sm" to="/">{tx("Back to my studio")}</Link> : <Link className="btn btn-joy btn-sm" to="/signup">{tx("Try Jovita free")}</Link>}
    </header>
  );
}

function Card({ p, big }) {
  return (
    <Link to={`/spotlight/${p.slug}`} className={`sp-card ${big ? "big" : ""}`}>
      <span className="sp-img" style={{ backgroundImage: p.cover_path ? `url("${spotUrl(p.cover_path)}")` : undefined }} />
      <span className="sp-meta">
        <small>{tx(KIND[p.kind] || "Story")}</small>
        <b>{p.title}</b>
        <span>{[p.person_name, tx(p.person_role || ""), p.location].filter(Boolean).join(" · ")}</span>
      </span>
    </Link>
  );
}

function usePosts() {
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
  const week = posts?.find((p) => p.kind === "creative_of_week");
  const rest = (posts || []).filter((p) => p !== week);
  const features = rest.filter((p) => p.kind === "feature");
  const stories = rest.filter((p) => p.kind !== "feature");
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
          <>
            {week && (
              <Link to={`/spotlight/${week.slug}`} className="sp-week">
                <span className="sp-week-img" style={{ backgroundImage: week.cover_path ? `url("${spotUrl(week.cover_path)}")` : undefined }} />
                <span className="sp-week-text">
                  <span className="pill p-joy"><Icon name="star" />{tx("Creative of the week")}</span>
                  <b className="sp-week-name">{week.person_name || week.title}</b>
                  <span className="sp-week-role">{[tx(week.person_role || ""), week.location].filter(Boolean).join(" · ")}</span>
                  <span className="sp-week-title">{week.title}</span>
                  {week.dek && <span className="sub">{week.dek}</span>}
                  <span className="sp-read">{tx("Read the story")} <Icon name="arrow" /></span>
                </span>
              </Link>
            )}
            {features.length > 0 && (
              <section className="sp-sec">
                <h2>{tx("Featured projects")}</h2>
                <div className="sp-grid">{features.map((p) => <Card key={p.id} p={p} />)}</div>
              </section>
            )}
            {stories.length > 0 && (
              <section className="sp-sec">
                <h2>{tx("More stories")}</h2>
                <div className="sp-grid">{stories.map((p) => <Card key={p.id} p={p} />)}</div>
              </section>
            )}
          </>
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

// Plain text with a little formatting: a blank line starts a new paragraph,
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
  const more = (posts || []).filter((x) => x.slug !== p.slug).slice(0, 3);
  return (
    <div className="sp">
      <Bar />
      <article className="sp-post">
        <div className="sp-cover" style={{ backgroundImage: p.cover_path ? `url("${spotUrl(p.cover_path)}")` : undefined }} />
        <div className="sp-post-head">
          <span className="pill p-joy">{p.kind === "creative_of_week" && <Icon name="star" />}{tx(KIND[p.kind] || "Story")}</span>
          <h1>{p.title}</h1>
          {p.dek && <p className="sp-dek">{p.dek}</p>}
          <div className="sp-by">
            <div><b>{p.person_name}</b><span>{[tx(p.person_role || ""), p.location].filter(Boolean).join(" · ")}</span></div>
            <span className="spacer" />
            {p.instagram && <a className="btn btn-secondary btn-sm" href={insta(p.instagram)} target="_blank" rel="noreferrer">Instagram</a>}
            {p.website && <a className="btn btn-secondary btn-sm" href={/^https?:/.test(p.website) ? p.website : `https://${p.website}`} target="_blank" rel="noreferrer">{tx("Website")}</a>}
            {photos.length > 0 && <a className="btn btn-secondary btn-sm" href="#their-work">{tx("See their work ({n})", { n: photos.length })}</a>}
            <button type="button" className="btn btn-ghost btn-sm" onClick={share}><Icon name="link" />{copied ? tx("Link copied") : tx("Share")}</button>
          </div>
          <small className="sub">{day(p.published_at)}</small>
        </div>
        <div className="sp-body">{bodyBlocks(p.body)}</div>
        {photos.length > 0 && <h2 className="sp-work-h" id="their-work">{p.person_name ? tx("{name}'s work", { name: p.person_name.split(" ")[0] }) : tx("Their work")}</h2>}
        {photos.length > 0 && (
          <div className="sp-photos">{photos.map((ph, i) => (
            <figure key={i}><button type="button" onClick={() => setOpen(i)} aria-label={tx("Open photo {n}", { n: i + 1 })}><img src={spotUrl(ph.path)} alt={ph.caption || ""} loading="lazy" /></button>{ph.caption && <figcaption>{ph.caption}</figcaption>}</figure>
          ))}</div>
        )}
      </article>
      {more.length > 0 && <section className="sp-sec sp-more"><h2>{tx("More from Spotlight")}</h2><div className="sp-grid">{more.map((x) => <Card key={x.id} p={x} />)}</div></section>}
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
