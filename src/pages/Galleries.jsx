import { supabase } from "../supabase";
import { useEffect, useState } from "react";
import { Thumb, deleteGalleryAll } from "../components/GalleryEditor";
import { useData } from "../lib/data";
import { useUi } from "../components/Shell";
import Icon from "../components/Icon";
import { CloseBtn, Empty, Modal, Pill, useToast } from "../components/ui";
import { addDays, fdate, first } from "../lib/format";
import { tx, txn } from "../lib/i18n";

const TONES = [["var(--tile1)", "var(--tile2)", "var(--tile4)"], ["var(--tile6)", "var(--tile3)", "var(--tile1)"], ["var(--tile3)", "var(--tile5)", "var(--tile4)"], ["var(--tile4)", "var(--tile1)", "var(--tile5)"]];
const tone = (id) => TONES[id.charCodeAt(0) % TONES.length];

function NewGallery({ onClose, onCreated }) {
  const { projects, clients, client, insert, studio } = useData();
  const toast = useToast();
  // Pick a saved project, or make a new one right here (with a saved client or a new one)
  const [pid, setPid] = useState(projects[0]?.id || "new");
  const [title, setTitle] = useState("");
  const [np, setNp] = useState({ name: "", cid: clients[0]?.id || "new", cname: "", cemail: "", date: "" });
  const [busy, setBusy] = useState(false);
  const isNew = pid === "new";
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      let p = projects.find((x) => x.id === pid);
      if (isNew) {
        const name = np.name.trim() || title.trim();
        if (!name) { setBusy(false); return toast(tx("Give the project a name.")); }
        let cid = np.cid;
        if (cid === "new") {
          if (!np.cname.trim()) { setBusy(false); return toast(tx("Add the client's name.")); }
          const c = await insert("clients", { name: np.cname.trim(), email: np.cemail.trim().toLowerCase(), phone: "", city: "", status: "client" });
          cid = c.id;
        }
        p = await insert("projects", { client_id: cid, title: name, type: "Portrait", stage: "editing", amount: 0, currency: studio?.home_currency || "NGN", session_date: np.date || null });
      }
      if (!p) { setBusy(false); return toast(tx("Pick a project.")); }
      const g = await insert("galleries", { project_id: p.id, client_id: p.client_id, title: title.trim() || p.title, status: "draft", event_date: p.session_date || null });
      toast(tx("Gallery created")); onCreated ? onCreated(g.id) : onClose();
    } catch (x) { toast(x.message); setBusy(false); }
  };
  return (
    <Modal label={tx("New gallery")} onClose={onClose}>
      <form style={{ display: "flex", flexDirection: "column", gap: 16 }} onSubmit={submit}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><h2 className="h-l">{tx("New gallery")}</h2><CloseBtn onClick={onClose} /></div>
        <div className="field"><label htmlFor="g-project">{tx("For which project?")}</label>
          <select id="g-project" value={pid} onChange={(e) => setPid(e.target.value)}>
            <option value="new">{tx("+ New project")}</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{client(p.client_id).name} · {p.title}</option>)}
          </select></div>
        {isNew && (
          <div className="ng-new">
            <div className="field"><label htmlFor="ng-pn">{tx("Project name")}</label><input id="ng-pn" autoFocus value={np.name} onChange={(e) => setNp({ ...np, name: e.target.value })} placeholder={tx("e.g. Ada & Tunde wedding")} /></div>
            <div className="form-grid">
              <div className="field"><label htmlFor="ng-c">{tx("Client")}</label>
                <select id="ng-c" value={np.cid} onChange={(e) => setNp({ ...np, cid: e.target.value })}>
                  <option value="new">{tx("+ New client")}</option>
                  {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select></div>
              <div className="field"><label htmlFor="ng-d">{tx("Session date")}</label><input id="ng-d" type="date" value={np.date} onChange={(e) => setNp({ ...np, date: e.target.value })} /></div>
            </div>
            {np.cid === "new" && <div className="form-grid">
              <div className="field"><label htmlFor="ng-cn">{tx("Client name")}</label><input id="ng-cn" value={np.cname} onChange={(e) => setNp({ ...np, cname: e.target.value })} /></div>
              <div className="field"><label htmlFor="ng-ce">{tx("Client email")}</label><input id="ng-ce" type="email" value={np.cemail} onChange={(e) => setNp({ ...np, cemail: e.target.value })} placeholder={tx("Optional")} /></div>
            </div>}
          </div>
        )}
        <div className="field"><label htmlFor="g-title">{tx("Gallery name")}</label><input id="g-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={tx("Leave blank to use the project name")} /></div>
        <p className="sub" style={{ fontSize: 13 }}>{isNew ? tx("The project (and client, if new) is saved too, so the gallery shows on their client page.") + " " : ""}{tx("Next, the gallery opens so you can add photos, sets and a design.")}</p>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}><button type="button" className="btn btn-ghost" data-dismiss onClick={onClose}>{tx("Cancel")}</button><button className="btn btn-primary" disabled={busy}>{busy ? tx("Creating…") : tx("Create gallery")}</button></div>
      </form>
    </Modal>
  );
}

export default function Galleries() {
  const { galleries, client, update, remove } = useData();
  const { q, setOpenGallery } = useUi();
  const toast = useToast();
  const [form, setForm] = useState(false);
  const [del, setDel] = useState(null); // gallery to delete
  const [busy, setBusy] = useState(false);
  const doDelete = async () => {
    setBusy(true);
    try { const n = await deleteGalleryAll(del.id, remove); toast(txn(n, "Gallery deleted with {n} photo", "Gallery deleted with {n} photos"), true); setDel(null); }
    catch (e) { toast(tx("Couldn't delete the gallery: {err}", { err: e.message })); }
    setBusy(false);
  };
  // Galleries without a chosen cover show their first photo
  const [firsts, setFirsts] = useState({});
  const missing = galleries.filter((g) => !g.cover_path && g.photo_count > 0).map((g) => g.id).join(",");
  useEffect(() => {
    if (!missing) return;
    let live = true;
    Promise.all(missing.split(",").map((gid) => supabase.from("gallery_photos").select("gallery_id,path").eq("gallery_id", gid).order("position", { ascending: true }).limit(1)))
      .then((rs) => { if (live) setFirsts(Object.fromEntries(rs.map((r) => r.data?.[0]).filter(Boolean).map((x) => [x.gallery_id, x.path]))); });
    return () => { live = false; };
  }, [missing]);
  const ql = q.toLowerCase();
  const list = galleries.filter((g) => !ql || (g.title + " " + client(g.client_id).name).toLowerCase().includes(ql));
  const deliver = async (g) => {
    await update("galleries", g.id, { status: "delivered", expires_on: addDays(30) });
    if (g.project_id) await update("projects", g.project_id, { gallery_delivered: true, stage: "delivered" });
    toast(tx("\"{title}\" delivered to {first}", {
      title: g.title,
      first: first(client(g.client_id).name)
    }), true);
  };
  return (
    <>
      <div className="head"><div><p className="eyebrow">{tx("Galleries")}</p><h1 className="h-l">{tx("Deliver photos and films")}</h1></div>
        <button className="btn btn-primary" onClick={() => setForm(true)}><Icon name="plus" />{tx("New gallery")}</button></div>
      {!galleries.length ? <Empty icon="image" title={tx("No galleries yet")} text={tx("Create a gallery for a project, then deliver it to your client's portal.")} action={<button className="btn btn-primary" onClick={() => setForm(true)}>{tx("New gallery")}</button>} /> : (
        <div className="gal">
          {list.map((g) => { const t = tone(g.id); const pc = g.status === "delivered" ? "p-success" : g.status === "proofing" ? "p-info" : "p-neutral"; return (
            <div className="galcard" key={g.id} onClick={(e) => { if (!e.target.closest("button")) setOpenGallery(g.id); }}>
              {g.cover_path || firsts[g.id] ? <div className="galcover"><Thumb path={g.cover_path || firsts[g.id]} alt="" /></div>
                : <div className="mosaic">{t.map((c, ix) => <i key={ix} style={{ background: c }} />)}</div>}
              <div className="body">
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}><b className="galtitle">{g.settings?.password && <span title={tx("Password protected")} aria-label={tx("Password protected")}><Icon name="lock" /></span>}{g.title}</b><Pill c={pc}>{g.status === "delivered" ? tx("Published") : g.status === "proofing" ? tx("Proofing") : tx("Draft")}</Pill></div>
                <p className="sub" style={{ fontSize: 13 }}>{client(g.client_id).name} · {g.photo_count}{" "}{tx("photos")}{g.expires_on ? tx(" · open until {fdate}", {
                    fdate: fdate(g.expires_on)
                  }) : ""}</p>
                <p style={{ fontSize: 13, display: "flex", gap: 14 }}><span>♥ {g.favourites}{" "}{tx("favourites")}</span><span>↓ {g.downloads}</span></p>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button className="btn btn-secondary btn-sm" onClick={() => setOpenGallery(g.id)}><Icon name="edit" />{tx("Open")}</button>
                  {g.status !== "delivered" ? <button className="btn btn-primary btn-sm" onClick={() => deliver(g)}><Icon name="send" />{tx("Deliver")}</button>
                    : <button className="btn btn-secondary btn-sm" onClick={async () => { await update("galleries", g.id, { expires_on: addDays(30) }); toast(tx("Open until {fdate}", {
                    fdate: fdate(addDays(30))
                  })); }}>{tx("Extend 30 days")}</button>}
                  <button className="btn btn-ghost btn-sm gal-del" onClick={() => setDel(g)} aria-label={tx("Delete {title}", { title: g.title })} title={tx("Delete gallery")}><Icon name="trash" /></button>
                </div>
              </div>
            </div>
          ); })}
        </div>
      )}
      {del && (
        <Modal label={tx("Delete gallery")} onClose={() => !busy && setDel(null)}>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><h2 className="h-l">{tx("Delete \"{name}\"?", { name: del.title })}</h2><CloseBtn onClick={() => !busy && setDel(null)} /></div>
            <p className="sub">{txn(del.photo_count || 0, "The gallery and its {n} photo will be deleted for good, with its sets, favourites, notes and client links.", "The gallery and its {n} photos will be deleted for good, with its sets, favourites, notes and client links.")}</p>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}><button type="button" className="btn btn-ghost" disabled={busy} onClick={() => setDel(null)}>{tx("Cancel")}</button><button type="button" className="btn btn-danger" disabled={busy} onClick={doDelete}><Icon name="trash" />{busy ? tx("Deleting…") : tx("Delete gallery")}</button></div>
          </div>
        </Modal>
      )}
      {form && <NewGallery onClose={() => setForm(false)} onCreated={(gid) => { setForm(false); setOpenGallery(gid); }} />}
    </>
  );
}
