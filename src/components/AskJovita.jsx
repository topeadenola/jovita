import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useData } from "../lib/data";
import { answer, SUGGESTIONS } from "../lib/ask";
import { command, fromBrain } from "../lib/askActions";
import { askBrain, brainOff, leftNote } from "../lib/brain";
import { useActions } from "../lib/actions";
import { mailLink } from "../lib/voice";
import { useToast } from "./ui";
import { useUi } from "./Shell";
import Icon from "./Icon";
import { AskIcon } from "./Jo";
import { getLang, tx } from "../lib/i18n";

const LANG_NAME = { en: "English", fr: "French", es: "Spanish", pt: "Portuguese", sw: "Swahili" };

// The chat stays open in memory when you close the panel, and is saved on this device,
// so it only ends when you press End chat.
const KEY = (id) => `jovita.chat.${id}`;
let memory = null; // { studioId, log, pending } — keeps action buttons alive while the panel is closed
const strip = (log) => log.map(({ buttons, ...m }) => (buttons ? { ...m, buttons: buttons.map((b) => ({ label: b.label, stale: true })) } : m));
function loadLog(studioId) {
  if (memory?.studioId === studioId) return memory;
  try { const s = JSON.parse(localStorage.getItem(KEY(studioId)) || "null"); if (s?.log?.length) return { studioId, log: s.log, pending: s.pending || null }; } catch { /* private window */ }
  return null;
}
const greeting = (name) => ({ who: "jo", at: Date.now(), text: name ? tx("Hi {name}! I'm Jovita, your assistant. What do you need help with today?", { name }) : tx("Hi! I'm Jovita, your assistant. What do you need help with today?"), chips: SUGGESTIONS });

function Draft({ d }) {
  const toast = useToast();
  const mail = mailLink(d.email, d.subject, d.text);
  const copy = async () => {
    try { await navigator.clipboard.writeText(d.text); toast(tx("Message copied")); } catch { toast(tx("Select the text to copy it")); }
  };
  return (
    <div className="bub jo draft">
      <small>{tx("To {name} · in your voice", { name: d.to })}</small>
      <span style={{ whiteSpace: "pre-line" }}>{d.text}</span>
      <div className="ask-acts">
        {mail && <a className="btn btn-secondary btn-sm" href={mail}>{tx("Email")}</a>}
        <button type="button" className="btn btn-ghost btn-sm" onClick={copy}><Icon name="link" />{tx("Copy")}</button>
      </div>
    </div>
  );
}

function transcript(log, studio) {
  const who = (m) => (m.who === "me" ? (studio.owner_first_name || tx("You")) : "Jovita");
  const time = (m) => (m.at ? new Date(m.at).toLocaleString() : "");
  return `${tx("Chat with Jovita")} · ${studio.name}\n\n` + log.map((m) => {
    let s = `[${time(m)}] ${who(m)}: ${m.text || ""}`;
    (m.drafts || []).forEach((d) => { s += `\n  ${tx("Draft to {name}", { name: d.to })}:\n  ${d.text.replace(/\n/g, "\n  ")}`; });
    return s;
  }).join("\n\n");
}

export default function AskJovita({ onClose }) {
  const data = useData();
  const { studio, session, insert } = data;
  const ui = useUi();
  const nav = useNavigate();
  const toast = useToast();
  const { invoiceAction } = useActions();
  const saved = loadLog(studio.id);
  const [log, setLog] = useState(() => saved?.log || [greeting(String(studio.owner_first_name || "").split(" ")[0])]);
  const [pending, setPending] = useState(saved?.pending || null);
  const [text, setText] = useState("");
  const [thinking, setThinking] = useState(false);
  const [ending, setEnding] = useState(false);
  const box = useRef(null);
  const input = useRef(null);

  // Remember the chat (memory for this visit, device storage for next time)
  useEffect(() => {
    memory = { studioId: studio.id, log, pending };
    try { localStorage.setItem(KEY(studio.id), JSON.stringify({ log: strip(log).slice(-200), pending })); } catch { /* storage full or blocked */ }
  }, [log, pending, studio.id]);
  useEffect(() => { input.current?.focus(); }, []);
  useEffect(() => { if (box.current) box.current.scrollTop = box.current.scrollHeight; }, [log, thinking]);
  useEffect(() => {
    const h = (e) => { if (e.key === "Escape" && !ending) onClose(); };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [onClose, ending]);

  const tools = {
    nav,
    insert,
    openInvoice: (id) => ui?.setOpenInvoice(id),
    openGallery: (id) => ui?.setOpenGallery(id),
    openProject: (id) => { nav("/projects"); ui?.setOpenProject(id); },
    markPaid: (i) => invoiceAction(i, "markpaid"),
    sendInvoice: (i) => invoiceAction(i, "send"),
  };
  const say = (m) => setLog((l) => [...l, { who: "jo", at: Date.now(), ...m }]);
  const runReply = async (r) => {
    if (r.pending !== undefined) setPending(r.pending || null); else setPending(null);
    const { run, ...shown } = r;
    if (shown.text) say(shown);
    if (run) {
      setThinking(true);
      try { const next = await run(); if (next) await runReply(next); }
      catch (e) { say({ text: tx("That didn't work: {err}", { err: e.message }) }); }
      finally { setThinking(false); }
    }
  };

  const ask = (q) => {
    const s = q.trim();
    if (!s || thinking) return;
    setText("");
    setLog((l) => [...l.map((m) => (m.buttons ? { ...m, buttons: m.buttons.map((b) => ({ ...b, stale: true })) } : m)), { who: "me", at: Date.now(), text: s }]);
    setThinking(true);
    const rules = (note) => {
      try {
        const act = command(s, { data, ui: tools, pending });
        if (note) say({ text: note });
        if (act) return runReply(act);
        setPending(null);
        say(answer(s, data));
      } catch (e) { say({ text: tx("Sorry, something went wrong: {err}", { err: e.message }) }); }
    };
    // A follow-up to a question the rules asked stays with the rules
    if (pending || brainOff()) { setTimeout(() => { setThinking(false); rules(); }, 450); return; }
    const history = [...log, { who: "me", text: s }];
    askBrain(history, { lang: LANG_NAME[getLang()] || "English", smart: s.length > 280 }).then((r) => {
      setThinking(false);
      if (r.error === "limit") {
        say({ text: r.message + " " + tx("Upgrade to keep using everything Jovita can do. Here's a basic answer for now:"), buttons: [{ label: tx("See plans"), primary: true, run: () => { ui?.openUpgrade?.(); return null; } }] });
        return rules();
      }
      if (!r.ok) return rules(["slow_down", "suspended"].includes(r.error) ? r.message + " " + tx("Here's what I can do without it:") : "");
      setPending(null);
      const { drafts, buttons } = fromBrain(r.actions, { data, ui: tools });
      say({ text: r.text + leftNote(r.quota), drafts: drafts.length ? drafts : undefined, buttons: buttons.length ? buttons : undefined, ai: true });
    });
  };
  const press = async (i, b) => {
    if (b.stale || thinking) return;
    setLog((l) => l.map((m, k) => (k === i ? { ...m, buttons: m.buttons.map((x) => ({ ...x, stale: true, chosen: x === b })) } : m)));
    setThinking(true);
    try { const r = await b.run(); if (r) await runReply(r); } catch (e) { say({ text: tx("That didn't work: {err}", { err: e.message }) }); } finally { setThinking(false); }
  };

  const email = session?.user?.email || "";
  const endChat = (how) => {
    const t = transcript(log, studio);
    if (how === "email" || how === "download") {
      const blob = new Blob([t], { type: "text/plain;charset=utf-8" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `jovita-chat-${new Date().toISOString().slice(0, 10)}.txt`;
      if (how === "download" || t.length > 1800) a.click();
      if (how === "email") {
        const body = t.length > 1800 ? t.slice(0, 1700) + "\n\n" + tx("(The full chat was saved to your Downloads as a file. Attach it here if you like.)") : t;
        window.location.href = `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(tx("Your chat with Jovita, {date}", { date: new Date().toLocaleDateString() }))}&body=${encodeURIComponent(body)}`;
      }
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    }
    memory = null;
    try { localStorage.removeItem(KEY(studio.id)); } catch { /* ignore */ }
    setLog([greeting(String(studio.owner_first_name || "").split(" ")[0])]);
    setPending(null);
    setEnding(false);
    toast(how === "email" ? tx("Chat ended. Your email app opened with the chat, press send to keep a copy.") : tx("Chat ended"));
  };

  return (
    <aside className="ask-panel" role="dialog" aria-label={tx("Ask Jovita")}>
      <div className="ask-head">
        <AskIcon state={thinking ? "typing" : "smile"} />
        <div style={{ flex: 1 }}><b>{tx("Ask Jovita")}</b><span>{tx("Your assistant · only acts when you ask")}</span></div>
        <button type="button" className="btn btn-ghost btn-sm ask-end" onClick={() => setEnding(true)} disabled={log.length < 2}>{tx("End chat")}</button>
        <button type="button" className="x" onClick={onClose} aria-label={tx("Minimise. Your chat stays here")} title={tx("Minimise. Your chat stays here")}><Icon name="x" /></button>
      </div>
      <div className="ask-log" ref={box} aria-live="polite">
        {log.map((m, i) => (
          <div key={i} style={{ display: "contents" }}>
            {m.text && <p className={`bub ${m.who}`} style={{ whiteSpace: "pre-line" }}>{m.text}</p>}
            {m.drafts?.map((d, j) => <Draft key={j} d={d} />)}
            {m.buttons && (
              <div className="ask-acts ask-btns">{m.buttons.map((b, j) => (
                <button key={j} type="button" className={`btn btn-sm ${b.chosen ? "btn-primary" : b.primary && !b.stale ? "btn-primary" : "btn-secondary"}`} disabled={b.stale} onClick={() => press(i, b)}>{b.label}</button>
              ))}</div>
            )}
            {m.chips && i === log.length - 1 && !thinking && (
              <div className="ask-chips">{m.chips.map((c) => <button key={c} type="button" onClick={() => ask(tx(c))}>{tx(c)}</button>)}</div>
            )}
          </div>
        ))}
        {thinking && <p className="bub jo typing" aria-label={tx("Jovita is typing")}><i /><i /><i /></p>}
      </div>
      <form className="ask-foot" onSubmit={(e) => { e.preventDefault(); ask(text); }}>
        <label className="ask-input"><span className="sr">{tx("Message Ask Jovita")}</span>
          <textarea ref={input} rows={1} value={text} onChange={(e) => { setText(e.target.value); e.target.style.height = "auto"; e.target.style.height = Math.min(e.target.scrollHeight, 140) + "px"; }}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); ask(text); e.currentTarget.style.height = "auto"; } }}
            placeholder={pending ? tx("Type the client's name") : tx("Ask or tell Jovita what to do")} autoComplete="off" />
          <button aria-label={tx("Send")}><Icon name="arrow" /></button>
        </label>
        <p className="ask-note">{tx("Jovita can make mistakes. Check important details before you send.")}<br />{tx("Shift + Enter for a new line.")}</p>
      </form>

      {ending && (
        <div className="ask-end-dlg" role="alertdialog" aria-modal="true" aria-labelledby="ae-t">
          <div className="card">
            <h2 id="ae-t" className="h-m">{tx("End this chat?")}</h2>
            <p className="sub">{tx("The conversation will be cleared from Jovita. Keep a copy first:")}</p>
            <button type="button" className="btn btn-primary" onClick={() => endChat("email")} disabled={!email}><Icon name="send" />{tx("Email the chat to me and end")}</button>
            {email && <small className="sub" style={{ fontSize: 12 }}>{tx("Opens your email app addressed to {email}. You press send.", { email })}</small>}
            <button type="button" className="btn btn-secondary" onClick={() => endChat("download")}><Icon name="download" />{tx("Download the chat and end")}</button>
            <button type="button" className="btn btn-ghost" onClick={() => endChat("none")}>{tx("End without a copy")}</button>
            <button type="button" className="btn btn-ghost" autoFocus onClick={() => setEnding(false)}>{tx("Keep chatting")}</button>
          </div>
        </div>
      )}
    </aside>
  );
}
