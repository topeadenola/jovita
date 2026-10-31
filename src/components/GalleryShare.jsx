import { useCallback, useEffect, useState } from "react";
import { supabase } from "../supabase";
import { useData } from "../lib/data";
import { clientMatches, fdate } from "../lib/format";
import { tx, txn } from "../lib/i18n";
import { useToast } from "./ui";
import Icon from "./Icon";
import { inviteLink, publicGalleryLink } from "../lib/links";

const EMAIL = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;
export const galleryLink = (token) => inviteLink(token);

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
  const { studio, clients } = useData();
  const [draft, setDraft] = useState(null); // the email preview: { list, msg, pw, pin }
  const [sugOpen, setSugOpen] = useState(false);
  const pinOn = !!(g.settings?.download?.on !== false && g.settings?.download?.pin_on && g.settings?.download?.pin);
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

  // The email they get: your message, their own link, and the password / PIN only if you tick them
  const defaultMsg = () => tx("Your photos from \"{title}\" are ready to view:", { title: g.title });
  const bodyFor = (inv, dr = draft || { msg: defaultMsg(), pw: true, pin: true }) => {
    const hi = inv.name ? tx("Hi {name},", { name: inv.name }) : tx("Hi,");
    const extra = [
      dr.pw && g.settings?.password ? tx("Password: {pw}", { pw: g.settings.password }) : "",
      dr.pin && pinOn ? tx("Download PIN: {pin}", { pin: g.settings.download.pin }) : "",
    ].filter(Boolean).join("\n");
    return `${hi}\n\n${dr.msg}\n${galleryLink(inv.token)}${extra ? "\n\n" + extra : ""}\n\n${studio.owner_first_name || studio.name}`;
  };
  const subject = () => tx("Your gallery: {title}", { title: g.title });
  const mail = (inv, dr) => `mailto:${encodeURIComponent(inv.email)}?subject=${encodeURIComponent(subject())}&body=${encodeURIComponent(bodyFor(inv, dr))}`;
  const preview = (list) => setDraft({ list, msg: defaultMsg(), pw: true, pin: true });
  const copy = async (text, msg) => { try { await navigator.clipboard.writeText(text); toast(msg || tx("Link copied"), true); } catch { toast(text); } };

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
      toast(txn(list.length, "{n} person invited. Check the email, then send.", "{n} people invited. Check the email, then send each one."), true);
      // Show the email before anything is sent
      if (data?.length) preview(data);
    } catch (x) { toast(x.message); } finally { setBusy(false); }
  }
  async function removeInvite(inv) {
    if (!window.confirm(tx("Remove {email}? Their link will stop working.", { email: inv.email }))) return;
    const { error } = await supabase.from("gallery_invites").delete().eq("id", inv.id);
    if (error) return toast(error.message);
    setInvites((l) => l.filter((x) => x.id !== inv.id));
  }

  // Saved contacts matching what's being typed (the part after the last comma)
  const lastPart = emails.split(/[,;\n]/).pop().trim();
  const already = new Set(emails.toLowerCase().split(/[\s,;]+/).filter(Boolean));
  const sugs = lastPart.length >= 2 && !EMAIL.test(lastPart) ? clients.filter((c) => c.email && !already.has(c.email.toLowerCase()) && clientMatches(c, lastPart)).slice(0, 6) : [];
  const pickContact = (c) => {
    const parts = emails.split(/([,;\n])/); parts[parts.length - 1] = (parts.length > 1 ? " " : "") + c.email;
    const next = parts.join("");
    setEmails(next + ", ");
    if (!/[,;\s]/.test(next.trim())) setName(c.name.split(" ")[0]);
    setSugOpen(false);
  };

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
        <div className="share-link"><input readOnly value={publicGalleryLink(g)} onFocus={(e) => e.target.select()} aria-label={tx("Gallery link")} />
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => copy(publicGalleryLink(g))}><Icon name="link" />{tx("Copy")}</button>
          <a className="btn btn-ghost btn-sm" href={publicGalleryLink(g)} target="_blank" rel="noreferrer"><Icon name="eye" />{tx("Open")}</a></div>
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
          <div className="cpick">
            <input id="gi-em" value={emails} onChange={(e) => { setEmails(e.target.value); setSugOpen(true); }} onFocus={() => setSugOpen(true)} onBlur={() => setTimeout(() => setSugOpen(false), 150)}
              placeholder={tx("Type a name, email or phone, or paste emails")} autoComplete="off" />
            {sugOpen && sugs.length > 0 && (
              <div className="cpick-list" role="listbox">
                {sugs.map((c) => (
                  <button type="button" key={c.id} onMouseDown={(e) => e.preventDefault()} onClick={() => pickContact(c)}>
                    <span><b>{c.name}</b><small>{[c.email, c.phone].filter(Boolean).join(" · ")}</small></span>
                  </button>
                ))}
              </div>
            )}
          </div></div>
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
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => preview([inv])}><Icon name="send" />{tx("Email")}</button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => copy(galleryLink(inv.token))} aria-label={tx("Copy link for {email}", { email: inv.email })}><Icon name="link" /></button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => removeInvite(inv)} aria-label={tx("Remove {email}", { email: inv.email })}><Icon name="x" /></button>
            </span>
          </li>
        ))}
      </ul>
      <p className="sub" style={{ fontSize: 13 }}>{tx("You see the email first. It then opens in your own mail app with their personal link ready, and you press send.")}</p>
      {draft && (
        <div className="scrim modal-wrap" onMouseDown={(e) => e.target === e.currentTarget && setDraft(null)}>
          <div className="modal gs-modal" role="dialog" aria-modal="true" aria-label={tx("Check the email")}>
            <div className="set-head"><h2 className="h-m">{tx("Check the email")}</h2><button type="button" className="x" onClick={() => setDraft(null)} aria-label={tx("Close")}><Icon name="x" /></button></div>
            <div className="field"><label htmlFor="gd-msg">{tx("Your message")}</label>
              <textarea id="gd-msg" rows={3} value={draft.msg} onChange={(e) => setDraft({ ...draft, msg: e.target.value })} /></div>
            {(g.settings?.password || pinOn) && (
              <div className="field"><label>{tx("Put in the email")}</label>
                {g.settings?.password && <label className="check"><input type="checkbox" checked={draft.pw} onChange={(e) => setDraft({ ...draft, pw: e.target.checked })} />{tx("The gallery password ({pw})", { pw: g.settings.password })}</label>}
                {pinOn && <label className="check"><input type="checkbox" checked={draft.pin} onChange={(e) => setDraft({ ...draft, pin: e.target.checked })} />{tx("The download PIN ({pin})", { pin: g.settings.download.pin })}</label>}
              </div>
            )}
            <div className="mail-preview">
              <p className="sub" style={{ fontSize: 13 }}><b>{tx("Subject")}:</b> {subject()}</p>
              <pre>{bodyFor(draft.list[0], draft)}</pre>
            </div>
            <ul className="invite-list">
              {draft.list.map((inv) => (
                <li key={inv.id}>
                  <span className="inv-who"><b>{inv.name || inv.email}</b>{inv.name && <small>{inv.email}</small>}</span>
                  <span className="inv-act">
                    <a className="btn btn-primary btn-sm" href={mail(inv, draft)}><Icon name="send" />{tx("Open in my email")}</a>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => copy(bodyFor(inv, draft), tx("Message copied"))} aria-label={tx("Copy the message for {email}", { email: inv.email })}><Icon name="file" /></button>
                  </span>
                </li>
              ))}
            </ul>
            <div style={{ display: "flex", justifyContent: "flex-end" }}><button type="button" className="btn btn-ghost" onClick={() => setDraft(null)}>{tx("Done")}</button></div>
          </div>
        </div>
      )}
    </>
  );
}
