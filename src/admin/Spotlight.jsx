// HQ › Spotlight: write and publish Creative of the week, featured projects and stories.
// Published posts show at /spotlight for everyone, signed in or not.
import { useEffect, useRef, useState } from "react";
import { supabase } from "../supabase";
import Icon from "./Icon";
import { SmileMark } from "./Celebrate";
import { date } from "./util";

const KINDS = [["creative_of_week", "Creative of the week"], ["feature", "Featured project"], ["story", "Story"]];
const KIND = Object.fromEntries(KINDS);
const ROLES = ["Photographer", "Videographer", "Makeup artist", "Content creator", "Designer", "Stylist", "Creative director"];
const BLANK = { slug: "", kind: "feature", title: "", dek: "", person_name: "", person_role: "Photographer", location: "", instagram: "", website: "", cover_path: null, photos: [], body: "", published: false };
const slugify = (s) => s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 70) || "post";
const url = (path) => (!path ? "" : /^https?:|^\//.test(path) ? path : supabase.storage.from("spotlight").getPublicUrl(path).data.publicUrl);
const APP = location.port === "5175" ? "http://localhost:5173" : "";

export default function Spotlight() {
  const [list, setList] = useState(null);
  const [edit, setEdit] = useState(null);
  const [err, setErr] = useState("");
  const load = () => supabase.from("spotlights").select("*").order("created_at", { ascending: false })
    .then(({ data, error }) => { if (error) throw error; setList(data || []); })
    .catch((e) => { setList([]); setErr(/spotlights/.test(e.message) ? "Run the latest Jovita update in Supabase to use Spotlight." : e.message); });
  useEffect(() => { load(); }, []);

  if (edit) return <Editor post={edit} onClose={() => { setEdit(null); load(); }} />;
  return (
    <>
      <div className="page-head">
        <div><p className="eyebrow">Spotlight</p><h1 className="h-l" style={{ marginTop: 6 }}>Celebrate creatives</h1>
          <p className="sub">Creative of the week, featured projects and stories. Published posts show on the Spotlight page for everyone, signed in or not.</p></div>
        <div className="row" style={{ gap: 10 }}>
          <a className="a-btn a-btn-ghost" href={`${APP}/spotlight`} target="_blank" rel="noreferrer"><Icon name="globe" />View Spotlight</a>
          <button type="button" className="a-btn a-btn-gold" onClick={() => setEdit({ ...BLANK })}><Icon name="plus" />New post</button>
        </div>
      </div>
      {err && <p className="err">{err}</p>}
      <section className="card table-card">
        {list === null ? <div className="loading" style={{ minHeight: 200 }}>Loading…</div> : list.length ? (
          <div className="tscroll"><table className="t sp-table"><thead><tr><th>Post</th><th>Type</th><th>Status</th><th>Date</th><th /></tr></thead>
            <tbody>{list.map((p) => (
              <tr key={p.id} onClick={() => setEdit(p)} style={{ cursor: "pointer" }}>
                <td><div className="sp-row"><span className="sp-thumb" style={{ backgroundImage: p.cover_path ? `url("${url(p.cover_path)}")` : undefined }} /><div><b>{p.title}</b><small className="sub">{[p.person_name, p.person_role, p.location].filter(Boolean).join(" · ")}</small></div></div></td>
                <td>{p.kind === "creative_of_week" ? <span className="pill p-pro">Creative of the week</span> : KIND[p.kind]}</td>
                <td><span className={`pill ${p.published ? "p-good" : ""}`}>{p.published ? "Published" : "Draft"}</span></td>
                <td>{date(p.published_at || p.created_at)}</td>
                <td className="r"><button type="button" className="a-btn a-btn-sm a-btn-ghost">Edit</button></td>
              </tr>
            ))}</tbody></table></div>
        ) : <div className="empty"><SmileMark size={44} /><b>No posts yet</b><span>Start with a Creative of the week: one creative, their best project, a few words in their voice.</span></div>}
      </section>
    </>
  );
}

function Editor({ post, onClose }) {
  const [f, setF] = useState(post);
  const [slugTouched, setSlugTouched] = useState(!!post.id);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [sure, setSure] = useState(false);
  const [prog, setProg] = useState(null); // { done, total } while their work uploads
  const [over, setOver] = useState(false);
  const files = useRef(null);
  const coverIn = useRef(null);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value, ...(k === "title" && !slugTouched ? { slug: slugify(e.target.value) } : {}) }));

  const upload = async (list, track) => {
    const folder = f.slug || slugify(f.title) || "post";
    const out = [];
    let done = 0;
    for (const file of list) {
      if (track) setProg({ done: done++, total: list.length });
      if (!/^image\/(jpeg|png|webp)$/.test(file.type)) { setErr(`${file.name}: use JPG, PNG or WebP.`); continue; }
      if (file.size > 15 * 1024 * 1024) { setErr(`${file.name} is over 15 MB.`); continue; }
      const path = `${folder}/${Date.now()}-${file.name.toLowerCase().replace(/[^a-z0-9.]+/g, "-")}`;
      const { error } = await supabase.storage.from("spotlight").upload(path, file, { contentType: file.type, upsert: false });
      if (error) { setErr(error.message); continue; }
      out.push(path);
    }
    return out;
  };
  // Their work: pick or drop several photos at once, in file-name order
  const addWork = async (fileList) => {
    const picked = [...fileList].filter((x) => x.type.startsWith("image/")).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    if (!picked.length) return;
    setBusy("Uploading their work…"); setErr("");
    const paths = await upload(picked, true);
    setF((x) => ({ ...x, photos: [...x.photos, ...paths.map((path) => ({ path, caption: "" }))], cover_path: x.cover_path || paths[0] || null }));
    setProg(null); setBusy("");
  };
  const addPhotos = (e) => { const l = [...e.target.files]; e.target.value = ""; addWork(l); };
  const setCover = async (e) => {
    const picked = [...e.target.files]; e.target.value = ""; if (!picked.length) return;
    setBusy("Uploading cover…"); const [path] = await upload(picked); if (path) setF((x) => ({ ...x, cover_path: path })); setBusy("");
  };
  const move = (i, d) => setF((x) => { const p = [...x.photos]; const j = i + d; if (j < 0 || j >= p.length) return x; [p[i], p[j]] = [p[j], p[i]]; return { ...x, photos: p }; });

  const save = async (publish) => {
    setErr("");
    if (!f.title.trim()) return setErr("Give the post a title.");
    const slug = slugify(f.slug || f.title);
    const row = { ...f, slug, published: publish ?? f.published, photos: f.photos };
    delete row.id; delete row.created_at; delete row.updated_at; delete row.published_at;
    setBusy("Saving…");
    const q = f.id ? supabase.from("spotlights").update(row).eq("id", f.id).select().single() : supabase.from("spotlights").insert(row).select().single();
    const { data, error } = await q;
    setBusy("");
    if (error) return setErr(/duplicate|unique/i.test(error.message) ? "Another post already uses that web address. Change the web address." : error.message);
    setF(data || { ...f, ...row });
    if (publish !== undefined) onClose();
  };
  const remove = async () => {
    if (!sure) return setSure(true);
    setBusy("Deleting…"); const { error } = await supabase.from("spotlights").delete().eq("id", f.id); setBusy("");
    if (error) return setErr(error.message);
    onClose();
  };

  return (
    <>
      <div className="page-head">
        <div><button type="button" className="a-btn a-btn-sm a-btn-ghost" onClick={onClose}>← All posts</button>
          <h1 className="h-l" style={{ marginTop: 10 }}>{f.id ? "Edit post" : "New post"}</h1></div>
        <div className="row" style={{ gap: 10, alignItems: "center" }}>
          {busy && <span className="sub">{busy}</span>}
          {f.id && f.published && <a className="a-btn a-btn-ghost" href={`${APP}/spotlight/${f.slug}`} target="_blank" rel="noreferrer"><Icon name="globe" />View live</a>}
          <button type="button" className="a-btn a-btn-ghost" disabled={!!busy} onClick={() => save()}>Save draft</button>
          {f.published ? <button type="button" className="a-btn a-btn-ghost" disabled={!!busy} onClick={() => save(false)}>Unpublish</button>
            : <button type="button" className="a-btn a-btn-gold" disabled={!!busy} onClick={() => save(true)}>Publish</button>}
        </div>
      </div>
      {err && <p className="err">{err}</p>}
      <div className="sp-edit">
        <section className="card sp-fields">
          <div className="field"><label>Type</label><div className="seg" role="group">{KINDS.map(([k, l]) => <button key={k} type="button" aria-pressed={f.kind === k} onClick={() => setF({ ...f, kind: k })}>{l}</button>)}</div></div>
          <div className="field"><label htmlFor="sp-t">Title</label><input id="sp-t" className="a-input" value={f.title} onChange={set("title")} maxLength={140} placeholder="Light, gold and a perfume called Evore" /></div>
          <div className="field"><label htmlFor="sp-d">The line under the title</label><input id="sp-d" className="a-input" value={f.dek} onChange={set("dek")} maxLength={300} placeholder="One sentence that makes people want to read" /></div>
          <div className="sp-two">
            <div className="field"><label htmlFor="sp-n">Creative's name</label><input id="sp-n" className="a-input" value={f.person_name} onChange={set("person_name")} /></div>
            <div className="field"><label htmlFor="sp-r">What they do</label><input id="sp-r" className="a-input" list="sp-roles" value={f.person_role} onChange={set("person_role")} /><datalist id="sp-roles">{ROLES.map((r) => <option key={r} value={r} />)}</datalist></div>
            <div className="field"><label htmlFor="sp-l">Where they're based</label><input id="sp-l" className="a-input" value={f.location} onChange={set("location")} placeholder="Lagos, Nigeria" /></div>
            <div className="field"><label htmlFor="sp-i">Instagram</label><input id="sp-i" className="a-input" value={f.instagram} onChange={set("instagram")} placeholder="@handle" /></div>
            <div className="field"><label htmlFor="sp-w">Website</label><input id="sp-w" className="a-input" value={f.website} onChange={set("website")} placeholder="theirsite.com" /></div>
            <div className="field"><label htmlFor="sp-s">Web address</label><input id="sp-s" className="a-input" value={f.slug} onChange={(e) => { setSlugTouched(true); setF({ ...f, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-") }); }} /><small className="sub">/spotlight/{slugify(f.slug || f.title)}</small></div>
          </div>
          <div className="field"><label htmlFor="sp-b">Story</label>
            <textarea id="sp-b" className="a-textarea" rows={14} value={f.body} onChange={set("body")} placeholder={"Write it like you'd tell a friend.\n\n## A heading\nA paragraph under it.\n\n> A quote from the creative, in their own words."} />
            <small className="sub">Leave a blank line between paragraphs. Start a line with ## for a heading, or &gt; for a quote.</small></div>
        </section>
        <section className="card sp-media">
          <div className="card-head"><h2 className="h-m">Cover</h2><button type="button" className="a-btn a-btn-sm a-btn-ghost" onClick={() => coverIn.current?.click()}><Icon name="image" />{f.cover_path ? "Change" : "Add cover"}</button></div>
          <input ref={coverIn} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={setCover} />
          <div className="sp-cover-prev" style={{ backgroundImage: f.cover_path ? `url("${url(f.cover_path)}")` : undefined }}>{!f.cover_path && <span>No cover yet. The first photo you add becomes the cover.</span>}</div>
          <div className="card-head" style={{ marginTop: 22, flexWrap: "nowrap", alignItems: "flex-start" }}><div style={{ flex: 1, minWidth: 0 }}><h2 className="h-m">Their work <span className="sub">({f.photos.length})</span></h2><small className="sub">Shown as a gallery on the post. Ask the creative first, and credit them.</small></div>
            <button type="button" className="a-btn a-btn-sm a-btn-gold" onClick={() => files.current?.click()} disabled={!!prog}><Icon name="plus" />Add work</button></div>
          <input ref={files} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={addPhotos} />
          <button type="button" className={`sp-drop ${over ? "over" : ""}`} disabled={!!prog} onClick={() => files.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
            onDrop={(e) => { e.preventDefault(); setOver(false); addWork(e.dataTransfer.files); }}>
            {prog ? <><b>Uploading {Math.min(prog.done + 1, prog.total)} of {prog.total}…</b><span className="sp-bar-track"><i style={{ width: `${Math.round((prog.done / prog.total) * 100)}%` }} /></span></>
              : <><Icon name="image" /><b>Drop their photos here, or click to choose</b><span>Pick as many as you like. JPG, PNG or WebP, up to 15 MB each.</span></>}
          </button>
          <div className="sp-photo-list">{f.photos.map((ph, i) => (
            <div key={ph.path} className="sp-ph">
              <span className="sp-ph-img" style={{ backgroundImage: `url("${url(ph.path)}")` }} />
              <div className="sp-ph-body">
                <input className="a-input" value={ph.caption} placeholder="Caption (optional)" onChange={(e) => setF((x) => ({ ...x, photos: x.photos.map((p, j) => (j === i ? { ...p, caption: e.target.value } : p)) }))} />
                <div className="row" style={{ gap: 6 }}>
                  <button type="button" className="a-btn a-btn-sm a-btn-ghost" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up">↑</button>
                  <button type="button" className="a-btn a-btn-sm a-btn-ghost" onClick={() => move(i, 1)} disabled={i === f.photos.length - 1} aria-label="Move down">↓</button>
                  <button type="button" className="a-btn a-btn-sm a-btn-ghost" onClick={() => setF((x) => ({ ...x, cover_path: ph.path }))} disabled={f.cover_path === ph.path}>{f.cover_path === ph.path ? "Cover" : "Use as cover"}</button>
                  <button type="button" className="a-btn a-btn-sm a-btn-ghost" onClick={() => setF((x) => ({ ...x, photos: x.photos.filter((_, j) => j !== i) }))}>Remove</button>
                </div>
              </div>
            </div>
          ))}</div>
          {f.id && <div style={{ marginTop: 24, paddingTop: 16, borderTop: "1px solid var(--line)" }}>
            <button type="button" className="a-btn a-btn-sm a-btn-danger" onClick={remove} disabled={!!busy}>{sure ? "Yes, delete this post for good" : "Delete post"}</button>
            {sure && <button type="button" className="a-btn a-btn-sm a-btn-ghost" onClick={() => setSure(false)} style={{ marginLeft: 8 }}>Keep it</button>}
          </div>}
        </section>
      </div>
    </>
  );
}
