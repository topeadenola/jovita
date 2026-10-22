import { useState } from "react";
import { useData } from "../lib/data";
import { useUi } from "../components/Shell";
import Icon from "../components/Icon";
import { Avatar, CloseBtn, Drawer, Empty, Pill, useToast } from "../components/ui";
import { fdate, fday, first, invState, money, projPill } from "../lib/format";
import { BookingForm } from "./Bookings";
import ImportClients from "../components/ImportClients";
import { tx } from "../lib/i18n";

function ClientDrawer({ c, onClose }) {
  const { projects, invoices, update, remove } = useData();
  const { open, setOpenProject, setOpenInvoice } = useUi();
  const [booking, setBooking] = useState(false);
  const docs = invoices.filter((i) => i.client_id === c.id).sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  const toast = useToast();
  const [f, setF] = useState({ name: c.name, email: c.email || "", phone: c.phone || "", city: c.city || "", status: c.status });
  const [del, setDel] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const ps = projects.filter((p) => p.client_id === c.id);
  const owes = invoices.filter((i) => i.client_id === c.id && i.status === "sent");
  return (
    <Drawer label={c.name} onClose={onClose}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
        <div className="who"><Avatar name={c.name} size={52} /><div><h2 className="h-l">{c.name}</h2><p className="sub">{c.city || tx("No city")}· {c.status === "lead" ? tx("Lead") : tx("Client")}{" "}{tx("since")}{" "}{fdate(c.created_at)}</p></div></div>
        <CloseBtn onClick={onClose} />
      </div>
      <div className="client-create">
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => { onClose(); open("quote", c.id); }}><Icon name="file" />{tx("Quote")}</button>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => { onClose(); open("invoice", c.id); }}><Icon name="receipt" />{tx("Invoice")}</button>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setBooking(true)}><Icon name="calendar" />{tx("Booking")}</button>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => { onClose(); open("project", c.id); }}><Icon name="folder" />{tx("Project")}</button>
      </div>
      {owes.length > 0 && <div className="card" style={{ background: "var(--warning-tint)", borderColor: "var(--warning-tint)" }}><b>{tx("Owes you")}{" "}{owes.map((i) => money(i.amount, i.currency)).join(" + ")}</b></div>}
      <form className="card" style={{ display: "flex", flexDirection: "column", gap: 12 }} onSubmit={async (e) => {
        e.preventDefault();
        try { await update("clients", c.id, f); toast(tx("Client saved")); } catch (x) { toast(x.message); }
      }}>
        <h3 className="h-m">{tx("Details")}</h3>
        <div className="form-grid">
          <div className="field"><label htmlFor="cd-name">{tx("Name")}</label><input id="cd-name" value={f.name} onChange={set("name")} /></div>
          <div className="field"><label htmlFor="cd-city">{tx("City")}</label><input id="cd-city" value={f.city} onChange={set("city")} /></div>
          <div className="field"><label htmlFor="cd-email">{tx("Email")}</label><input id="cd-email" type="email" value={f.email} onChange={set("email")} /></div>
          <div className="field"><label htmlFor="cd-phone">{tx("Phone")}</label><input id="cd-phone" value={f.phone} onChange={set("phone")} /></div>
          <div className="field"><label htmlFor="cd-status">{tx("Status")}</label><select id="cd-status" value={f.status} onChange={set("status")}><option value="lead">{tx("Lead")}</option><option value="client">{tx("Client")}</option></select></div>
        </div>
        <button className="btn btn-primary" style={{ alignSelf: "flex-start" }}>{tx("Save")}</button>
      </form>
      <section className="card">
        <div className="head" style={{ marginBottom: 8 }}><h3 className="h-m">{tx("Projects")}</h3><button className="btn btn-ghost btn-sm" onClick={() => { onClose(); open("project", c.id); }}><Icon name="plus" />{tx("New project")}</button></div>
        <div className="todo">
          {ps.map((p) => { const pl = projPill(p); return (<div className="todo-item" key={p.id}><div className="todo-text"><b>{p.title}</b><span>{fday(p.session_date)} · {money(p.amount, p.currency)}</span></div><Pill c={pl.c}>{pl.k}</Pill><button className="btn btn-ghost btn-sm" onClick={() => { onClose(); setOpenProject(p.id); }}>{tx("Open")}</button></div>); })}
          {!ps.length && <p className="sub">{tx("No projects yet.")}</p>}
        </div>
      </section>
      <section className="card">
        <div className="head" style={{ marginBottom: 8 }}><h3 className="h-m">{tx("Quotes and invoices")}</h3></div>
        <div className="todo">
          {docs.map((i) => { const st = invState(i); return (<div className="todo-item" key={i.id}><div className="todo-text"><b>{i.kind === "quote" ? tx("Quote") : tx("Invoice")}{i.number ? ` #${i.number}` : ""}{i.label ? ` · ${i.label}` : ""}</b><span>{fdate(i.created_at)} · {money(i.amount, i.currency)}</span></div><Pill c={st.c}>{tx(st.k)}</Pill><button className="btn btn-ghost btn-sm" onClick={() => { onClose(); setOpenInvoice(i.id); }}>{tx("Open")}</button></div>); })}
          {!docs.length && <p className="sub">{tx("No quotes or invoices yet.")}</p>}
        </div>
      </section>
      {del ? (
        <div className="card" style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", borderColor: "var(--danger)" }}>
          <p style={{ flex: 1, minWidth: 200 }}>{tx("Delete")}{" "}{first(c.name)}{tx("? This also deletes their projects, invoices and messages.")}</p>
          <button className="btn btn-ghost btn-sm" onClick={() => setDel(false)}>{tx("Keep")}</button>
          <button className="btn btn-sm" style={{ background: "var(--danger-tint)", color: "var(--danger)" }} onClick={async () => { await remove("clients", c.id); toast(tx("Client deleted")); onClose(); }}>{tx("Delete client")}</button>
        </div>
      ) : <button className="btn btn-ghost" style={{ alignSelf: "flex-start", color: "var(--danger)" }} onClick={() => setDel(true)}>{tx("Delete client")}</button>}
      {booking && <BookingForm initial={{ client_id: c.id }} onClose={() => setBooking(false)} />}
    </Drawer>
  );
}

export default function Clients() {
  const { clients, projects, invoices } = useData();
  const { q, open } = useUi();
  const [tab, setTab] = useState("all");
  const [sel, setSel] = useState(null);
  const [imp, setImp] = useState(false);
  const ql = q.toLowerCase();
  const list = clients.filter((c) => (tab === "all" || c.status === tab) && (!ql || [c.name, c.email, c.city, c.phone].join(" ").toLowerCase().includes(ql)));
  const selected = clients.find((c) => c.id === sel);
  const tabs = [["all", "All", clients.length], ["client", "Clients", clients.filter((c) => c.status === "client").length], ["lead", "Leads", clients.filter((c) => c.status === "lead").length]];

  return (
    <>
      <div className="head"><div><p className="eyebrow">{tx("Clients")}</p><h1 className="h-l">{tx("Everyone you work with")}</h1></div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button className="btn btn-secondary" onClick={() => setImp(true)}><Icon name="file" />{tx("Import from file")}</button>
          <button className="btn btn-primary" onClick={() => open("client")}><Icon name="plus" />{tx("Add client")}</button></div></div>
      {!clients.length ? <Empty icon="users" title={tx("No clients yet")} text={tx(
        "Add your first client, or bring everyone over from a spreadsheet in one go."
      )} action={<div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center" }}><button className="btn btn-primary" onClick={() => setImp(true)}>{tx("Import from CSV or Excel")}</button><button className="btn btn-secondary" onClick={() => open("client")}>{tx("Add one client")}</button></div>} /> : (
        <>
          <div className="tabs" role="tablist">{tabs.map(([k, l, n]) => <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>{tx(l)} <span className="count">{n}</span></button>)}</div>
          <div className="tablewrap"><table><thead><tr><th>{tx("Name")}</th><th>{tx("Status")}</th><th>{tx("Projects")}</th><th>{tx("Owes you")}</th><th>{tx("Phone")}</th><th>{tx("Added")}</th></tr></thead><tbody>
            {list.map((c) => {
              const owe = invoices.filter((i) => i.client_id === c.id && i.status === "sent");
              return (
                <tr className="click" key={c.id} tabIndex={0} onClick={() => setSel(c.id)} onKeyDown={(e) => e.key === "Enter" && setSel(c.id)}>
                  <td><div className="who"><Avatar name={c.name} /><div><b>{c.name}</b><small>{[c.email, c.city].filter(Boolean).join(" · ")}</small></div></div></td>
                  <td><Pill c={c.status === "lead" ? "p-info" : "p-neutral"}>{c.status === "lead" ? tx("Lead") : tx("Client")}</Pill></td>
                  <td className="num">{projects.filter((p) => p.client_id === c.id).length}</td>
                  <td className="num">{owe.length ? owe.map((i) => money(i.amount, i.currency)).join(", ") : "—"}</td>
                  <td className="num">{c.phone || "—"}</td>
                  <td>{fdate(c.created_at)}</td>
                </tr>
              );
            })}
            {!list.length && <tr><td colSpan={6} className="sub">{tx("No one matches \"")}{q}".</td></tr>}
          </tbody></table></div>
        </>
      )}
      {imp && <ImportClients onClose={() => setImp(false)} />}
      {selected && <ClientDrawer key={selected.id} c={selected} onClose={() => setSel(null)} />}
    </>
  );
}
