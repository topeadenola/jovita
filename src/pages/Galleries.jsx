import { supabase } from "../supabase";
import { useState } from "react";
import { useData } from "../lib/data";
import { useUi } from "../components/Shell";
import Icon from "../components/Icon";
import { CloseBtn, Empty, Modal, Pill, useToast } from "../components/ui";
import { addDays, fdate, first } from "../lib/format";
import { tx } from "../lib/i18n";

const TONES = [["var(--tile1)", "var(--tile2)", "var(--tile4)"], ["var(--tile6)", "var(--tile3)", "var(--tile1)"], ["var(--tile3)", "var(--tile5)", "var(--tile4)"], ["var(--tile4)", "var(--tile1)", "var(--tile5)"]];
const tone = (id) => TONES[id.charCodeAt(0) % TONES.length];

function NewGallery({ onClose, onCreated }) {
  const { projects, client, insert } = useData();
  const toast = useToast();
  const [pid, setPid] = useState(projects[0]?.id || "");
  const [title, setTitle] = useState("");
  return (
    <Modal label={tx("New gallery")} onClose={onClose}>
      <form style={{ display: "flex", flexDirection: "column", gap: 16 }} onSubmit={async (e) => {
        e.preventDefault();
        const p = projects.find((x) => x.id === pid);
        if (!p) return toast(tx("Create a project first."));
        const g = await insert("galleries", { project_id: p.id, client_id: p.client_id, title: title.trim() || p.title, status: "draft", event_date: p.session_date || null });
        toast(tx("Gallery created")); onCreated ? onCreated(g.id) : onClose();
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><h2 className="h-l">{tx("New gallery")}</h2><CloseBtn onClick={onClose} /></div>
        <div className="field"><label htmlFor="g-project">{tx("For which project?")}</label><select id="g-project" value={pid} onChange={(e) => setPid(e.target.value)}>{projects.map((p) => <option key={p.id} value={p.id}>{client(p.client_id).name} · {p.title}</option>)}</select></div>
        <div className="field"><label htmlFor="g-title">{tx("Gallery name")}</label><input id="g-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={tx("Leave blank to use the project name")} /></div>
        <p className="sub" style={{ fontSize: 13 }}>{tx("Next, the gallery opens so you can add photos, sets and a design.")}</p>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}><button type="button" className="btn btn-ghost" data-dismiss onClick={onClose}>{tx("Cancel")}</button><button className="btn btn-primary">{tx("Create gallery")}</button></div>
      </form>
    </Modal>
  );
}

export default function Galleries() {
  const { galleries, client, update } = useData();
  const { q, setOpenGallery } = useUi();
  const toast = useToast();
  const [form, setForm] = useState(false);
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
              {g.cover_path ? <div className="galcover" style={{ backgroundImage: `url("${supabase.storage.from("gallery-photos").getPublicUrl(g.cover_path).data.publicUrl}")` }} />
                : <div className="mosaic">{t.map((c, ix) => <i key={ix} style={{ background: c }} />)}</div>}
              <div className="body">
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}><b style={{ fontFamily: "var(--font-display)", fontSize: 16 }}>{g.title}</b><Pill c={pc}>{g.status === "delivered" ? tx("Published") : g.status === "proofing" ? tx("Proofing") : tx("Draft")}</Pill></div>
                <p className="sub" style={{ fontSize: 13 }}>{client(g.client_id).name}· {g.photo_count}{" "}{tx("photos")}{g.expires_on ? tx(" · open until {fdate}", {
                    fdate: fdate(g.expires_on)
                  }) : ""}</p>
                <p style={{ fontSize: 13, display: "flex", gap: 14 }}><span>♥ {g.favourites}{" "}{tx("favourites")}</span><span>↓ {g.downloads}</span></p>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button className="btn btn-secondary btn-sm" onClick={() => setOpenGallery(g.id)}><Icon name="edit" />{tx("Open")}</button>
                  {g.status !== "delivered" ? <button className="btn btn-primary btn-sm" onClick={() => deliver(g)}><Icon name="send" />{tx("Deliver")}</button>
                    : <button className="btn btn-secondary btn-sm" onClick={async () => { await update("galleries", g.id, { expires_on: addDays(30) }); toast(tx("Open until {fdate}", {
                    fdate: fdate(addDays(30))
                  })); }}>{tx("Extend 30 days")}</button>}
                </div>
              </div>
            </div>
          ); })}
        </div>
      )}
      {form && <NewGallery onClose={() => setForm(false)} onCreated={(gid) => { setForm(false); setOpenGallery(gid); }} />}
    </>
  );
}
