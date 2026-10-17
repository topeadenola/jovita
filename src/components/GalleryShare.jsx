import { useCallback, useEffect, useState } from "react";
import { supabase } from "../supabase";
import { useData } from "../lib/data";
import { fdate } from "../lib/format";
import { tx, txn } from "../lib/i18n";
import { useToast } from "./ui";
import Icon from "./Icon";

const EMAIL = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;
export const galleryLink = (token) => `${location.origin}/g/${token}`;

function ago(ts) {
  if (!ts) return "";
  const m = Math.round((Date.now() - new Date(ts).getTime()) / 60000);
  if (m < 1) return tx("just now");
  if (m < 60) return txn(m, "{n} minute ago", "{n} minutes ago");
  const h = Math.round(m / 60);
  if (h < 24) return txn(h, "{n} hour ago", "{n} hours ago");
  return fdate(ts);
}

// Gallery › Share: invite people by email. Each person gets their own link, so you can see who opened it.
export default function GalleryShare({ g, view, published, publish }) {
  const { studio } = useData();
  const toast = useToast();
  const [invites, setInvites] = useState(null);
  const [emails, setEmails] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [missing, setMissing] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await supabase.from("gallery_invites").select("*").eq("gallery_id", g.id).order("invited_at", { ascending: false });
    if (error) { setMissing(true); setInvites([]); return; }
    setInvites(data || []);
  }, [g.id]);
  useEffect(() => { load(); }, [load]);
  // Views update while the panel is open
  useEffect(() => { const t = setInterval(load, 30000); return () => clearInterval(t); }, [load]);

  const mail = (inv) => {
    const link = galleryLink(inv.token);
    const hi = inv.name ? tx("Hi {name},", { name: inv.name }) : tx("Hi,");
    const pw = g.settings?.password ? "\n\n" + tx("Password: {pw}", { pw: g.settings.password }) : "";
    const body = `${hi}\n\n${tx("Your photos from \"{title}\" are ready to view:", { title: g.title })}\n${link}${pw}\n\n${studio.owner_first_name || studio.name}`;
    return `mailto:${encodeURIComponent(inv.email)}?subject=${encodeURIComponent(tx("Your gallery: {title}", { title: g.title }))}&body=${encodeURIComponent(body)}`;
  };
  const copy = async (text) => { try { await navigator.clipboard.writeText(text); toast(tx("Link copied"), true); } catch { toast(text); } };

  async function invite(e) {
    e.preventDefault();
    const list = [...new Set(emails.split(/[\s,;]+/).map((x) => x.trim().toLowerCase()).filter(Boolean))];
    const bad = list.filter((x) => !EMAIL.test(x));
    if (!list.length) return toast(tx("Type at least one email address."));
    if (bad.length) return toast(tx("Check these emails: {list}", { list: bad.join(", ") }));
    setBusy(true);
    try {
      const rows = list.map((email) => ({ studio_id: studio.id, gallery_id: g.id, email, name: list.length === 1 ? name.trim() : "" }));
      const { data, error } = await supabase.from("gallery_invites").upsert(rows, { onConflict: "gallery_id,email", ignoreDuplicates: false }).select();
      if (error) throw error;
      setEmails(""); setName("");
      await load();
      toast(txn(list.length, "{n} person invited. Tap Email to send their link.", "{n} people invited. Tap Email to send each link."), true);
      // One person: open the email straight away (you still press send)
      if (data?.length === 1) window.location.href = mail(data[0]);
    } catch (x) { toast(x.message); } finally { setBusy(false); }
  }
  async function removeInvite(inv) {
    if (!window.confirm(tx("Remove {email}? Their link will stop working.", { email: inv.email }))) return;
    const { error } = await supabase.from("gallery_invites").delete().eq("id", inv.id);
    if (error) return toast(error.message);
    setInvites((l) => l.filter((x) => x.id !== inv.id));
  }

  if (missing) return (
    <div className="ge-empty"><Icon name="lock" /><b>{tx("One quick setup step")}</b>
      <span className="sub">{tx("Run the Jovita update in Supabase (RUN-THIS-IN-SUPABASE.sql) to turn on gallery invites and view tracking.")}</span></div>
  );

  const opened = (invites || []).filter((x) => x.views > 0).length;
  const notLive = !published && (
    <div className="ge-note"><Icon name="eye" /><span>{tx("This gallery is a draft. People you invite can open it once you publish.")}</span>
      <button type="button" className="btn btn-primary btn-sm" onClick={() => publish(true)}>{tx("Publish")}</button></div>
  );

  if (view === "link") return (
    <>
      <h2 className="h-m">{tx("Gallery link")}</h2>
      <p className="sub">{tx("Anyone with this link can view the gallery. To see exactly who opened it, invite people by email instead.")}</p>
      {notLive}
      {g.share_token ? (
        <div className="share-link"><input readOnly value={galleryLink(g.share_token)} onFocus={(e) => e.target.select()} aria-label={tx("Gallery link")} />
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => copy(galleryLink(g.share_token))}><Icon name="link" />{tx("Copy")}</button>
          <a className="btn btn-ghost btn-sm" href={galleryLink(g.share_token)} target="_blank" rel="noreferrer"><Icon name="eye" />{tx("Open")}</a></div>
      ) : <p className="sub">{tx("Reload the page after running the Supabase update to get this gallery's link.")}</p>}
      {g.settings?.password && <p className="sub" style={{ fontSize: 13 }}>{tx("Viewers need the gallery password: {pw}", { pw: g.settings.password })}</p>}
    </>
  );

  return (
    <>
      <h2 className="h-m">{tx("Invite people")}</h2>
      <p className="sub">{tx("Add their email. Each person gets a personal link, so you can see who viewed the gallery and when.")}</p>
      {notLive}
      <form className="invite-form" onSubmit={invite}>
        <div className="field" style={{ flex: 2 }}><label htmlFor="gi-em">{tx("Email addresses")}</label>
          <input id="gi-em" value={emails} onChange={(e) => setEmails(e.target.value)} placeholder={tx("tara@email.com, mum@email.com")} autoComplete="off" /></div>
        <div className="field" style={{ flex: 1 }}><label htmlFor="gi-nm">{tx("Name (optional)")}</label>
          <input id="gi-nm" value={name} onChange={(e) => setName(e.target.value)} placeholder={tx("Tara")} disabled={/[\s,;]/.test(emails.trim())} /></div>
        <button className="btn btn-primary" disabled={busy}><Icon name="send" />{busy ? tx("Inviting…") : tx("Invite")}</button>
      </form>

      <div className="invite-head">
        <b>{invites ? txn(invites.length, "{n} person invited", "{n} people invited") : tx("Loading…")}</b>
        {invites?.length > 0 && <span className="pill p-success">{txn(opened, "{n} viewed", "{n} viewed")}</span>}
        <span className="spacer" />
        <button type="button" className="btn btn-ghost btn-sm" onClick={load}>{tx("Refresh")}</button>
      </div>
      {invites?.length === 0 && <div className="ge-empty"><Icon name="users" /><span className="sub">{tx("No one invited yet.")}</span></div>}
      <ul className="invite-list">
        {(invites || []).map((inv) => (
          <li key={inv.id}>
            <span className="inv-who"><b>{inv.name || inv.email}</b>{inv.name && <small>{inv.email}</small>}</span>
            <span className={`inv-seen ${inv.views ? "on" : ""}`}>
              {inv.views ? <><Icon name="eye" />{txn(inv.views, "Viewed {n} time", "Viewed {n} times")} · {ago(inv.last_viewed_at)}</> : tx("Not opened yet")}
            </span>
            <span className="inv-act">
              <a className="btn btn-secondary btn-sm" href={mail(inv)}><Icon name="send" />{tx("Email")}</a>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => copy(galleryLink(inv.token))} aria-label={tx("Copy link for {email}", { email: inv.email })}><Icon name="link" /></button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => removeInvite(inv)} aria-label={tx("Remove {email}", { email: inv.email })}><Icon name="x" /></button>
            </span>
          </li>
        ))}
      </ul>
      <p className="sub" style={{ fontSize: 13 }}>{tx("Email opens your own mail app with their personal link ready. You press send.")}</p>
    </>
  );
}
