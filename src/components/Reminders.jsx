import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useData } from "../lib/data";
import { useUi } from "./Shell";
import { daysFrom, first, fday, ftime, invState, money } from "../lib/format";
import { tx, txn } from "../lib/i18n";
import Icon from "./Icon";

// Reminders that sit top-right and stay until you close them.
// Closing hides one for today; if it still needs you tomorrow, it comes back.
const KEY = "jovita-reminders-closed";
const today = () => new Date().toISOString().slice(0, 10);
function closedToday() {
  try { const v = JSON.parse(localStorage.getItem(KEY) || "{}"); return v.day === today() ? v.ids : []; } catch { return []; }
}
function rememberClosed(ids) { try { localStorage.setItem(KEY, JSON.stringify({ day: today(), ids })); } catch { /* private window */ } }

export default function Reminders() {
  const { subscriptions = [], invoices = [], bookings = [], projects = [], messages = [], client } = useData();
  const ui = useUi();
  const nav = useNavigate();
  const [closed, setClosed] = useState(closedToday);
  const [all, setAll] = useState(false);

  const items = useMemo(() => {
    const out = [];
    // Subscriptions about to renew or expire (Evoto, Adobe, Lightroom…)
    subscriptions.filter((s) => s.active && s.next_renewal).forEach((s) => {
      const d = daysFrom(s.next_renewal);
      if (d > 7) return;
      out.push({
        id: `sub-${s.id}-${s.next_renewal}`, tone: d < 0 ? "bad" : d <= 2 ? "warn" : "info", icon: "clock",
        title: d < 0 ? tx("{name} has expired", { name: s.name }) : d === 0 ? tx("{name} renews today", { name: s.name }) : txn(d, "{name} renews tomorrow", "{name} renews in {n} days", { name: s.name }),
        body: tx("{amount} · {cycle}. Top up your card or cancel it if you don't need it.", { amount: money(s.amount, s.currency), cycle: tx(s.cycle === "yearly" ? "yearly" : "monthly") }),
        action: [tx("Open subscriptions"), () => nav("/accounting")], weight: d < 0 ? 0 : 1,
      });
    });
    // Late invoices
    const late = invoices.filter((i) => invState(i).k === "Overdue");
    if (late.length) out.push({
      id: `late-${late.map((i) => i.id).join(".")}`, tone: "bad", icon: "wallet",
      title: late.length === 1 ? tx("{name}'s invoice is {n} days late", { name: first(client(late[0].client_id).name), n: invState(late[0]).late }) : tx("{n} invoices are late", { n: late.length }),
      body: late.length === 1 ? money(late[0].amount, late[0].currency) : late.slice(0, 3).map((i) => first(client(i.client_id).name)).join(", "),
      action: [tx("Send a nudge"), () => (late.length === 1 ? ui?.setOpenInvoice(late[0].id) : nav("/money"))], weight: 2,
    });
    // Sessions today and tomorrow
    bookings.filter((b) => [0, 1].includes(daysFrom(b.starts_at))).forEach((b) => {
      const d = daysFrom(b.starts_at);
      out.push({ id: `bk-${b.id}`, tone: "info", icon: "calendar", title: d === 0 ? tx("Shoot today: {title}", { title: b.title }) : tx("Shoot tomorrow: {title}", { title: b.title }), body: `${fday(b.starts_at)} · ${ftime(b.starts_at)} · ${client(b.client_id).name}`, action: [tx("Open bookings"), () => nav("/bookings")], weight: 3 });
    });
    // Contracts not signed with the shoot coming up
    projects.filter((p) => !p.contract_signed && p.session_date && daysFrom(p.session_date) >= 0 && daysFrom(p.session_date) <= 3 && p.stage !== "inquiry").forEach((p) => {
      out.push({ id: `ct-${p.id}`, tone: "warn", icon: "file", title: tx("{name} hasn't signed the contract", { name: first(client(p.client_id).name) }), body: txn(daysFrom(p.session_date), "The shoot is in {n} day.", "The shoot is in {n} days.", {}), action: [tx("Open project"), () => { nav("/projects"); ui?.setOpenProject(p.id); }], weight: 2 });
    });
    // Enquiries waiting more than a day
    const waiting = messages.filter((m) => m.from_client && !m.read && Date.now() - new Date(m.created_at) > 864e5);
    if (waiting.length) out.push({ id: `msg-${waiting.map((m) => m.id).join(".")}`, tone: "info", icon: "inbox", title: txn(waiting.length, "{n} message has waited over a day", "{n} messages have waited over a day"), body: tx("Quick replies win bookings."), action: [tx("Open inbox"), () => nav("/inbox")], weight: 3 });
    return out.filter((x) => !closed.includes(x.id)).sort((a, b) => a.weight - b.weight);
  }, [subscriptions, invoices, bookings, projects, messages, client, closed, nav, ui]);

  if (!items.length) return null;
  const close = (id) => { const next = [...closed, id]; setClosed(next); rememberClosed(next); };
  const shown = all ? items : items.slice(0, 3);
  return (
    <div className="reminders" role="region" aria-label={tx("Reminders")}>
      {shown.map((r) => (
        <div key={r.id} className={`rem rem-${r.tone}`} role="alert">
          <span className="rem-ic"><Icon name={r.icon} /></span>
          <div className="rem-body">
            <b>{r.title}</b>
            {r.body && <span>{r.body}</span>}
            {r.action && <button type="button" className="rem-act" onClick={r.action[1]}>{r.action[0]} →</button>}
          </div>
          <button type="button" className="rem-x" onClick={() => close(r.id)} aria-label={tx("Close reminder")}><Icon name="x" /></button>
        </div>
      ))}
      {items.length > 3 && <button type="button" className="rem-more" onClick={() => setAll(!all)}>{all ? tx("Show fewer") : tx("{n} more reminders", { n: items.length - 3 })}</button>}
    </div>
  );
}
