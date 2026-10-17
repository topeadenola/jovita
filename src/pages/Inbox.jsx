import { useEffect, useMemo, useRef, useState } from "react";
import { useData } from "../lib/data";
import { useUi } from "../components/Shell";
import Icon from "../components/Icon";
import { Avatar, Modal, useToast } from "../components/ui";
import { ago, first } from "../lib/format";
import { mailLink, waLink } from "../lib/voice";
import { useUnsaved } from "../lib/unsaved";
import { tx } from "../lib/i18n";

// One inbox for every channel. Each message carries a badge so you always know where it came from.
export const CH = {
  whatsapp: { label: "WhatsApp", cls: "ch-wa" },
  email: { label: "Email", cls: "ch-em" },
  portal: { label: "Client page", cls: "ch-po" },
};
export function ChannelBadge({ ch, small }) {
  const c = CH[ch] || CH.portal;
  return (
    <span className={`ch ${c.cls} ${small ? "sm" : ""}`}>
      {ch === "whatsapp" ? (
        <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2c-1.6 0-3.1-.4-4.4-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.2-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.3.8 3.2.6.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.2-1.2-.1-.1-.3-.2-.5-.3z" /></svg>
      ) : <Icon name={ch === "email" ? "send" : "link"} />}
      {!small && tx(c.label)}
    </span>
  );
}

function ConnectPanel({ onClose }) {
  return (
    <Modal title={tx("Connect your channels")} onClose={onClose} wide>
      <p className="sub">{tx("Bring WhatsApp, email and your client pages into this one inbox. Every message keeps a badge showing where it came from, and replies go back the same way.")}</p>
      <div className="conn-grid">
        <section className="conn">
          <div className="conn-top"><ChannelBadge ch="portal" /><span className="pill p-success">{tx("Connected")}</span></div>
          <b>{tx("Client page messages")}</b>
          <p>{tx("Messages clients send from their Jovita link already land here. Nothing to set up.")}</p>
        </section>
        <section className="conn">
          <div className="conn-top"><ChannelBadge ch="whatsapp" /><span className="pill p-warning">{tx("Not connected yet")}</span></div>
          <b>{tx("WhatsApp Business")}</b>
          <ol>
            <li>{tx("Get the WhatsApp Business app number you use for clients ready. It must be a business number (Meta's rule).")}</li>
            <li>{tx("Create a free Meta Business account and a WhatsApp Business Platform app at business.facebook.com.")}</li>
            <li>{tx("Add your number to the app and verify it with the code Meta sends.")}</li>
            <li>{tx("Paste the access token and phone number ID into Jovita. Jovita then receives new messages here and sends your replies.")}</li>
          </ol>
          <p className="conn-note">{tx("Meta charges a small fee per conversation after the free monthly allowance. Until it's connected, Reply by WhatsApp opens WhatsApp with your message ready, and you can log important chats here.")}</p>
        </section>
        <section className="conn">
          <div className="conn-top"><ChannelBadge ch="email" /><span className="pill p-warning">{tx("Not connected yet")}</span></div>
          <b>{tx("Email")}</b>
          <ol>
            <li>{tx("Easiest: connect Gmail or Outlook with one click and pick which emails Jovita can see (only clients' emails are brought in).")}</li>
            <li>{tx("Or forward client emails to your private Jovita address. Jovita matches each one to the client by their email address.")}</li>
            <li>{tx("Replies you write here are sent from your own email address, so clients see you, not Jovita.")}</li>
          </ol>
          <p className="conn-note">{tx("Until it's connected, Reply by email opens your email app with the message ready.")}</p>
        </section>
      </div>
      <p className="sub" style={{ fontSize: 13 }}>{tx("Connecting needs a one-time setup on the Jovita server. Your messages stay private to your studio.")}</p>
    </Modal>
  );
}

function LogMessage({ onClose, pre }) {
  const { clients, insert } = useData();
  const toast = useToast();
  const [f, setF] = useState({ client_id: pre || clients[0]?.id || "", channel: "whatsapp", from_client: "yes", body: "" });
  return (
    <Modal title={tx("Log a message")} onClose={onClose}>
      <form className="stack" onSubmit={async (e) => {
        e.preventDefault();
        if (!f.body.trim()) return toast(tx("Paste or type the message."));
        try { await insert("messages", { client_id: f.client_id, channel: f.channel, from_client: f.from_client === "yes", read: true, body: f.body.trim().slice(0, 4000) }); toast(tx("Added to the conversation")); onClose(); } catch (x) { toast(x.message); }
      }}>
        <p className="sub">{tx("Keep a WhatsApp chat or email in the client's history by pasting it here.")}</p>
        <div className="form-grid">
          <div className="field"><label htmlFor="lm-c">{tx("Client")}</label><select id="lm-c" value={f.client_id} onChange={(e) => setF({ ...f, client_id: e.target.value })}>{clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
          <div className="field"><label htmlFor="lm-ch">{tx("Came from")}</label><select id="lm-ch" value={f.channel} onChange={(e) => setF({ ...f, channel: e.target.value })}>{Object.entries(CH).map(([k, v]) => <option key={k} value={k}>{tx(v.label)}</option>)}</select></div>
        </div>
        <div className="field"><label htmlFor="lm-w">{tx("Who wrote it")}</label><select id="lm-w" value={f.from_client} onChange={(e) => setF({ ...f, from_client: e.target.value })}><option value="yes">{tx("The client")}</option><option value="no">{tx("You")}</option></select></div>
        <div className="field"><label htmlFor="lm-b">{tx("Message")}</label><textarea id="lm-b" rows={5} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} /></div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}><button type="button" className="btn btn-ghost" data-dismiss>{tx("Cancel")}</button><button className="btn btn-primary">{tx("Add")}</button></div>
      </form>
    </Modal>
  );
}

export default function Inbox() {
  const { messages, client, clients, projects, insert, update, reload } = useData();
  const { setOpenProject } = useUi();
  const toast = useToast();
  const [filter, setFilter] = useState("all");
  const [connect, setConnect] = useState(false);
  const [logging, setLogging] = useState(false);
  const counts = useMemo(() => {
    const n = { all: messages.length };
    messages.forEach((m) => { n[m.channel] = (n[m.channel] || 0) + 1; });
    return n;
  }, [messages]);
  const threads = useMemo(() => {
    const by = {};
    [...messages].filter((m) => filter === "all" || m.channel === filter)
      .sort((a, b) => (a.created_at < b.created_at ? -1 : 1)).forEach((m) => { (by[m.client_id] ||= []).push(m); });
    return Object.entries(by).map(([cid, msgs]) => ({ cid, msgs, last: msgs[msgs.length - 1], chans: [...new Set(msgs.map((m) => m.channel))], unread: msgs.some((m) => m.from_client && !m.read) }))
      .sort((a, b) => (a.last.created_at < b.last.created_at ? 1 : -1));
  }, [messages, filter]);
  const [sel, setSel] = useState(null);
  const [text, setText] = useState("");
  const [via, setVia] = useState(null);
  const box = useRef(null);
  const t = threads.find((x) => x.cid === sel) || threads[0];
  const c = t ? client(t.cid) : null;
  const channel = via || t?.last.channel || "portal";

  useEffect(() => { setVia(null); }, [t?.cid]);
  useEffect(() => { if (box.current) box.current.scrollTop = box.current.scrollHeight; }, [t?.msgs.length, t?.cid]);
  useEffect(() => {
    if (!t) return;
    const unread = t.msgs.filter((m) => m.from_client && !m.read);
    if (unread.length) Promise.all(unread.map((m) => update("messages", m.id, { read: true }))).catch(() => {});
  }, [t?.cid]); // eslint-disable-line react-hooks/exhaustive-deps

  const send = async () => {
    const body = text.trim();
    if (!body || !t) return;
    // Until WhatsApp and email are connected, open the app with the message ready, and keep a copy here
    const out = channel === "whatsapp" ? waLink(c.phone, body) : channel === "email" ? mailLink(c.email, tx("Re: your message"), body) : null;
    if ((channel === "whatsapp" && !c.phone) || (channel === "email" && !c.email)) { toast(channel === "whatsapp" ? tx("Add {name}'s WhatsApp number in Clients first.", { name: first(c.name) }) : tx("Add {name}'s email in Clients first.", { name: first(c.name) })); throw new Error("contact"); }
    await insert("messages", { client_id: t.cid, channel, from_client: false, read: true, body: body.slice(0, 4000) });
    setText("");
    if (out) window.open(out, channel === "whatsapp" ? "_blank" : "_self", "noopener");
    toast(channel === "portal" ? tx("Sent to {name}'s client page", { name: first(c.name) }) : channel === "whatsapp" ? tx("WhatsApp opened with your reply. Press send there.") : tx("Your email app opened with your reply. Press send there."));
  };
  useUnsaved(!!text.trim(), send);

  const head = (
    <div className="head"><div><p className="eyebrow">{tx("Inbox")}</p><h1 className="h-l">{tx("All your client messages")}</h1></div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button className="btn btn-secondary btn-sm" onClick={() => setConnect(true)}><Icon name="link" />{tx("Connect WhatsApp and email")}</button>
        {clients.length > 0 && <button className="btn btn-ghost btn-sm" onClick={() => setLogging(true)}><Icon name="plus" />{tx("Log a message")}</button>}
        <button className="btn btn-ghost btn-sm" onClick={reload}>{tx("Refresh")}</button>
      </div></div>
  );
  const chips = (
    <div className="ch-filter" role="group" aria-label={tx("Show messages from")}>
      {[["all", "All"], ["whatsapp", "WhatsApp"], ["email", "Email"], ["portal", "Client page"]].map(([k, label]) => (
        <button key={k} type="button" aria-pressed={filter === k} onClick={() => { setFilter(k); setSel(null); }}>
          {k !== "all" && <ChannelBadge ch={k} small />}{tx(label)}<span className="n">{counts[k] || 0}</span>
        </button>
      ))}
    </div>
  );
  const modals = <>{connect && <ConnectPanel onClose={() => setConnect(false)} />}{logging && <LogMessage pre={t?.cid} onClose={() => setLogging(false)} />}</>;

  if (!t) return (
    <>{head}{messages.length > 0 && chips}
      <div className="card inbox-empty">
        <Icon name="inbox" />
        <b>{messages.length ? tx("No {channel} messages yet", { channel: tx(CH[filter]?.label || "") }) : tx("No messages yet")}</b>
        <p className="sub">{tx("Messages from your client pages land here now. Connect WhatsApp and email to see everything in one place, each with a badge showing where it came from.")}</p>
        <button className="btn btn-primary" onClick={() => setConnect(true)}><Icon name="link" />{tx("Connect WhatsApp and email")}</button>
      </div>{modals}</>
  );

  const proj = projects.find((p) => p.client_id === t.cid);
  return (
    <>
      {head}{chips}
      <div className="inbox">
        <div className="threads">
          {threads.map((x) => { const cc = client(x.cid); return (
            <button className="thread" key={x.cid} aria-current={x.cid === t.cid} onClick={() => setSel(x.cid)}>
              <Avatar name={cc.name} />
              <div className="t-body"><div className="t-top"><b>{cc.name}</b><span>{ago(x.last.created_at)}</span></div>
                <p>{x.unread && <b style={{ fontSize: 13 }}>● </b>}{x.last.body}</p>
                <span className="t-chans">{x.chans.map((ch) => <ChannelBadge key={ch} ch={ch} />)}</span></div>
            </button>
          ); })}
        </div>
        <div className="convo">
          <div className="convo-head"><Avatar name={c.name} /><div style={{ flex: 1, minWidth: 0 }}><b>{c.name}</b><p className="sub" style={{ fontSize: 13 }}>{[c.phone, c.email].filter(Boolean).join(" · ")}</p></div>
            {proj && <button className="btn btn-secondary btn-sm" onClick={() => setOpenProject(proj.id)}><Icon name="folder" />{proj.title}</button>}</div>
          <div className="msgs" ref={box}>
            {t.msgs.map((m) => (
              <div className={`msg ${m.from_client ? "" : "me"}`} key={m.id}>
                {m.body}
                <small><ChannelBadge ch={m.channel} small /> {tx(CH[m.channel]?.label || "")} · {m.from_client ? first(c.name) : tx("You")} · {ago(m.created_at)}</small>
              </div>
            ))}
          </div>
          <form className="reply" onSubmit={async (e) => { e.preventDefault(); try { await send(); } catch (x) { if (x.message !== "contact") toast(x.message); } }}>
            <label className="reply-via"><span className="sr">{tx("Reply by")}</span>
              <select value={channel} onChange={(e) => setVia(e.target.value)} aria-label={tx("Reply by")}>
                {Object.entries(CH).map(([k, v]) => <option key={k} value={k}>{tx(v.label)}</option>)}
              </select></label>
            <label htmlFor="replybox" className="sr">{tx("Reply")}</label>
            <input id="replybox" value={text} onChange={(e) => setText(e.target.value)} placeholder={tx("Reply to {first}…", { first: first(c.name) })} autoComplete="off" />
            <button className="btn btn-primary"><Icon name="send" />{tx("Send")}</button>
          </form>
        </div>
      </div>
      {modals}
    </>
  );
}
