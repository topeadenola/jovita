import { useState } from "react";
import { Link } from "react-router-dom";
import { useData } from "../lib/data";
import { useActions } from "../lib/actions";
import { useUi } from "../components/Shell";
import Icon from "../components/Icon";
import { Avatar, useToast } from "../components/ui";
import { ago, daysFrom, dom, dow, fday, first, ftime, invState, money, short, totalLine, totalsBy } from "../lib/format";
import { summary } from "../lib/accounting";
import { loadSampleData } from "../lib/sample";
import { tx, txn } from "../lib/i18n";

export default function Today() {
  const { studio, clients, projects, invoices, bookings, galleries, messages, expenses, subscriptions, client, reload } = useData();
  const { projectAction, invoiceAction } = useActions();
  const { open, setOpenProject } = useUi();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const h = new Date().getHours();
  const greet = h < 12 ? tx("Good morning") : h < 17 ? tx("Good afternoon") : tx("Good evening");

  if (!clients.length) {
    return (
      <>
        <div className="head"><div><p className="eyebrow">{tx("Welcome")}</p><h1 className="h-xl">{greet}, {studio.owner_first_name}</h1>
          <p className="sub" style={{ marginTop: 6 }}>{tx("Let's set up")}{" "}{studio.name}{tx(". Add your first client, or explore with example data.")}</p></div></div>
        <div className="grid g-2">
          <section className="card stat hero" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <h2 className="h-m">{tx("Add your first client")}</h2><p>{tx("Then create a project, send a contract and get paid, all from one link.")}</p>
            <button className="btn btn-primary" style={{ alignSelf: "flex-start" }} onClick={() => open("client")}><Icon name="plus" />{tx("Add a client")}</button>
          </section>
          <section className="card" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <h2 className="h-m">{tx("Explore with example data")}</h2><p className="sub">{tx(
            "We'll add 7 made-up clients with projects, invoices, bookings and galleries. You can delete them later."
          )}</p>
            <button className="btn btn-secondary" style={{ alignSelf: "flex-start" }} disabled={busy} onClick={async () => {
              setBusy(true);
              try { await loadSampleData(studio.id); await reload(); toast(tx("Example data added"), true); } catch (e) { toast(e.message); } finally { setBusy(false); }
            }}>{busy ? tx("Adding…") : tx("Load example data")}</button>
          </section>
          <section className="card" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <h2 className="h-m">{tx("Check your templates")}</h2><p className="sub">{tx(
            "Your contract, model release, invoice packages and emails are ready to edit."
          )}</p>
            <Link className="btn btn-secondary" style={{ alignSelf: "flex-start" }} to="/settings?tab=templates"><Icon name="file" />{tx("Open templates")}</Link>
          </section>
        </div>
      </>
    );
  }

  const todos = [];
  invoices.forEach((i) => {
    const st = invState(i);
    if (st.k === "Overdue") todos.push({ tone: "danger", pill: "Overdue", icon: "wallet", title: txn(st.late, "{name}'s invoice ({amount}) is {n} day late", "{name}'s invoice ({amount}) is {n} days late", { name: first(client(i.client_id).name), amount: short(i.amount, i.currency) }), sub: tx("Invoice #{number} · {label}", { number: i.number, label: i.label }), btn: tx("Send a nudge"), run: () => invoiceAction(i, "nudge") });
    if (st.k === "Check payment") todos.push({ tone: "info", pill: "Check payment", icon: "wallet", title: tx("{name} says they've paid {amount}", { name: first(client(i.client_id).name), amount: short(i.amount, i.currency) }), sub: tx("Invoice #{number} · check your account", { number: i.number }), btn: tx("Mark paid"), run: () => invoiceAction(i, "markpaid") });
  });
  projects.forEach((p) => {
    const c = client(p.client_id);
    if (p.stage === "inquiry") todos.push({ tone: "info", pill: "New inquiry", icon: "chat", title: tx("{name} asked about {title}", { name: c.name, title: p.title.toLowerCase() }), sub: `${fday(p.session_date)} · ${c.city || ""}`, btn: tx("Send quote"), run: () => projectAction(p, "quote") });
    else if (!p.contract_signed && p.contract_template_id !== null && p.stage !== "delivered") todos.push({ tone: "warning", pill: "Unsigned", icon: "file", title: tx("{name}'s contract isn't signed yet", { name: first(c.name) }), sub: `${p.title} · ${fday(p.session_date)}`, btn: tx("Share link"), run: () => projectAction(p, "contract") });
  });
  galleries.forEach((g) => {
    if (g.status === "delivered" && g.expires_on && daysFrom(g.expires_on) <= 10 && daysFrom(g.expires_on) >= 0)
      todos.push({ tone: "joy", pill: "Closing soon", icon: "image", title: tx("\"{title}\" closes in {n} days", { title: g.title, n: daysFrom(g.expires_on) }), sub: tx("{n} favourites · a good moment to offer prints", { n: g.favourites }), btn: tx("Open"), link: "/galleries" });
  });

  const home = studio.home_currency;
  const unpaid = invoices.filter((i) => i.status === "sent");
  const owed = totalLine(totalsBy(unpaid), home);
  const overdue = unpaid.filter((i) => invState(i).k === "Overdue").length;
  const month = summary({ invoices, expenses: expenses || [], subscriptions: subscriptions || [] }, "month", home);
  const upcoming = bookings.filter((b) => new Date(b.starts_at) >= new Date(new Date().toDateString())).sort((a, b) => (a.starts_at < b.starts_at ? -1 : 1));
  const week = upcoming.filter((b) => daysFrom(b.starts_at) <= 7);
  const recent = [...(messages || [])].filter((m) => m.from_client).sort((a, b) => (a.created_at < b.created_at ? 1 : -1)).slice(0, 3);
  const CH = { whatsapp: "WhatsApp", email: "Email", portal: "Portal" };

  return (
    <>
      <div className="head">
        <div><h1 className="h-xl">{greet}, {studio.owner_first_name}</h1>
          <p className="sub" style={{ marginTop: 6, fontSize: 17 }}>{fday(new Date().toISOString())} · {todos.length ? txn(todos.length, "{n} thing needs you today", "{n} things need you today") : tx("You're all caught up. Enjoy the shoot!")}</p></div>
        <Link className="btn btn-secondary" to="/projects"><Icon name="folder" />{tx("Open pipeline")}</Link>
      </div>
      <div className="grid g-4">
        <Link to="/money" className="card stat hero" style={{ textDecoration: "none" }}><p className="label">{tx("Owed to you")}</p><p className="val num">{owed.main}</p>
          <p className="note">{txn(unpaid.length, "{n} invoice", "{n} invoices")}{overdue ? " · " + txn(overdue, "{n} late", "{n} late") : ""}{owed.others.startsWith("+") ? " · " + owed.others : ""}</p></Link>
        <div className="card stat"><p className="label">{tx("Paid this month")}</p><p className="val num">{money(month.income, home)}</p><p className="note">{txn(month.incomeRows.length, "{n} payment", "{n} payments")}</p></div>
        <div className="card stat"><p className="label">{tx("Profit this month")}</p><p className="val num">{money(month.profit, home)}</p><p className="note">{tx("After {amount} spent", { amount: money(month.spent, home) })}</p></div>
        <div className="card stat soft"><p className="label">{tx("Shoots this week")}</p><p className="val num">{week.length}</p><p className="note">{week[0] ? tx("Next: {first}, {fday}", {
          first: first(client(week[0].client_id).name),
          fday: fday(week[0].starts_at)
        }) : tx("Nothing booked")}</p></div>
      </div>
      <div className="split">
        <section className="card" aria-labelledby="needs" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <h2 id="needs" className="h-m">{tx("Needs you today")}</h2>
          <div className="needs">
            {todos.length ? todos.map((t, ix) => (
              <div className="need" key={ix}>
                <span className={`pill p-${t.tone === "joy" ? "joy" : t.tone}`}>{tx(t.pill)}</span>
                <div className="todo-text"><b>{t.title}</b><span>{t.sub}</span></div>
                {t.link ? <Link className="btn btn-secondary btn-sm" to={t.link}>{t.btn}</Link>
                  : <button className={`btn btn-sm ${ix === 0 ? "btn-primary" : "btn-secondary"}`} onClick={t.run}>{t.btn}</button>}
              </div>
            )) : <p className="sub">{tx("Nothing waiting.")}</p>}
          </div>
        </section>
        <div style={{ display: "flex", flexDirection: "column", gap: 20, minWidth: 0 }}>
          <section className="card" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div className="head"><h2 className="h-m">{tx("This week")}</h2><Link className="btn btn-ghost btn-sm" to="/bookings">{tx("See all")}</Link></div>
            {upcoming.slice(0, 4).map((b) => (
              <div className="week-row" key={b.id}>
                <span className="week-day">{dow(b.starts_at)}<b>{dom(b.starts_at)}</b></span>
                <div className="todo-text"><b>{first(client(b.client_id).name)} · {b.title}</b><span>{ftime(b.starts_at)}{client(b.client_id).city ? " · " + client(b.client_id).city : ""}</span></div>
                {b.project_id && <button className="btn btn-ghost btn-sm" onClick={() => setOpenProject(b.project_id)}>{tx("Open")}</button>}
              </div>
            ))}
            {!upcoming.length && <p className="sub">{tx("No sessions booked yet.")}</p>}
          </section>
          <section className="card" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div className="head"><h2 className="h-m">{tx("Inbox")}</h2><Link className="btn btn-ghost btn-sm" to="/inbox">{tx("Open")}</Link></div>
            {recent.map((m) => (
              <div className="mini-inbox" key={m.id}>
                <p><b>{client(m.client_id).name}</b> <span className="sub">{m.body}</span></p>
                <span className={`chan ch-${m.channel}`}>{tx(CH[m.channel] || m.channel)}</span>
              </div>
            ))}
            {!recent.length && <p className="sub">{tx("No messages yet. Clients can write to you from their portal.")}</p>}
          </section>
        </div>
      </div>
    </>
  );
}
