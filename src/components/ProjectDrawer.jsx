import { useState } from "react";
import { useData } from "../lib/data";
import { useActions } from "../lib/actions";
import { STAGES, STAGE_LABEL, first, fday, invState, money, nextStep, portalUrl, projPill } from "../lib/format";
import Icon from "./Icon";
import { Avatar, CloseBtn, CopyBox, Drawer, Pill, useToast } from "./ui";
import { tx } from "../lib/i18n";
import { useUi } from "./Shell";

export default function ProjectDrawer({ id, onClose, onNewInvoice }) {
  const { project, client, invoices, templates, update, remove } = useData();
  const { projectAction, invoiceAction } = useActions();
  const toast = useToast();
  const ui = useUi();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const p = project(id);
  if (!p) return null;
  const c = client(p.client_id);
  const n = nextStep(p);
  const pill = projPill(p);
  const inv = invoices.filter((i) => i.project_id === p.id);
  const contracts = templates.filter((t) => t.kind === "contract");
  const releases = templates.filter((t) => t.kind === "model_release");
  const steps = [
    [tx("Inquiry and quote"), p.stage !== "inquiry", p.stage !== "inquiry" ? tx("Quote accepted") : tx("Send a quote")],
    [tx("Contract signed"), p.contract_signed, p.contract_signed ? tx("Signed by {name}", { name: p.contract_signed_name || c.name }) : p.contract_template_id ? tx("Waiting for {name}", { name: first(c.name) }) : tx("No contract on this project")],
    ...(p.release_template_id ? [[tx("Model release"), p.release_signed, p.release_signed ? tx("Signed by {name}", { name: p.release_signed_name }) : tx("Optional, signed in the portal")]] : []),
    [tx("Deposit paid"), p.deposit_paid, p.deposit_paid ? tx("Received") : tx("Waiting")],
    [tx("Session"), ["editing", "delivered"].includes(p.stage), fday(p.session_date)],
    [tx("Gallery delivered"), p.gallery_delivered, p.gallery_delivered ? tx("Delivered") : tx("After editing")],
  ];
  const firstOpen = steps.findIndex((s) => !s[1]);
  const set = async (patch, msg) => { try { await update("projects", p.id, patch); if (msg) toast(msg); } catch (e) { toast(e.message); } };

  return (
    <Drawer label={p.title} onClose={onClose}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
        <div><p className="eyebrow">{tx(p.type)} · {tx(STAGE_LABEL[p.stage])}</p><h2 className="h-l">{tx("{name}'s {title}", { name: first(c.name), title: p.title.toLowerCase() })}</h2><p className="sub">{fday(p.session_date)}{c.city ? ` · ${c.city}` : ""}</p></div>
        <CloseBtn onClick={onClose} />
      </div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}><Pill c={pill.c}>{pill.k}</Pill><Pill c="p-neutral">{money(p.amount, p.currency)}</Pill></div>
      <div className="card" style={{ background: "var(--lilac)", borderColor: "var(--lilac)", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 180 }}><p className="eyebrow">{tx("Next step")}</p><b style={{ fontSize: 17 }}>{n.t}</b></div>
        <button className="btn btn-primary" onClick={() => projectAction(p, n.a, { open: ui?.setOpenInvoice })}>{n.t}</button>
      </div>
      <section className="card">
        <h3 className="h-m" style={{ marginBottom: 4 }}>{tx("Progress")}</h3>
        <div className="steps">
          {steps.map((s, ix) => (
            <div className="step" key={s[0]}>
              <span className={`tick ${s[1] ? "done" : ix === firstOpen ? "now" : ""}`}>{s[1] ? <Icon name="check" /> : ix + 1}</span>
              <div className="s-body"><b>{s[0]}</b><br /><span>{s[2]}</span></div>
            </div>
          ))}
        </div>
        <div className="form-grid" style={{ marginTop: 10 }}>
          <div className="field"><label htmlFor="pd-stage">{tx("Stage")}</label>
            <select id="pd-stage" value={p.stage} onChange={(e) => set({ stage: e.target.value }, tx("Moved to {stage}", { stage: tx(STAGE_LABEL[e.target.value]) }))}>{STAGES.map((s) => <option key={s} value={s}>{tx(STAGE_LABEL[s])}</option>)}</select></div>
          <div className="field"><label htmlFor="pd-dep">{tx("Deposit")}</label>
            <select id="pd-dep" value={p.deposit_paid ? "y" : "n"} onChange={(e) => set({ deposit_paid: e.target.value === "y" })}><option value="n">{tx("Not paid")}</option><option value="y">{tx("Paid")}</option></select></div>
        </div>
      </section>
      <section className="card" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <h3 className="h-m">{tx("Client portal")}</h3>
        <p className="sub" style={{ fontSize: 13 }}>{tx("One link where")}{" "}{first(c.name)}{" "}{tx("signs, pays and sees the gallery. No account needed.")}</p>
        <CopyBox value={portalUrl(p.portal_token)} label={tx("Copy")} />
        <a className="btn btn-secondary" href={`/p/${p.portal_token}`} target="_blank" rel="noreferrer"><Icon name="eye" />{tx("See what")}{" "}{first(c.name)}{" "}{tx("sees")}</a>
      </section>
      <section className="card" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <h3 className="h-m">{tx("Documents")}</h3>
        <div className="form-grid">
          <div className="field"><label htmlFor="pd-contract">{tx("Contract")}</label>
            <select id="pd-contract" value={p.contract_template_id || ""} disabled={p.contract_signed} onChange={(e) => set({ contract_template_id: e.target.value || null }, tx("Contract updated"))}>
              {contracts.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}<option value="">{tx("No contract")}</option></select>
            {p.contract_signed && <span className="help">{tx("Signed, so it can't be changed.")}</span>}</div>
          <div className="field"><label htmlFor="pd-release">{tx("Model release")}</label>
            <select id="pd-release" value={p.release_template_id || ""} disabled={p.release_signed} onChange={(e) => set({ release_template_id: e.target.value || null }, tx("Model release updated"))}>
              {releases.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}<option value="">{tx("Not needed")}</option></select></div>
        </div>
      </section>
      <section className="card">
        <div className="head" style={{ marginBottom: 6 }}><h3 className="h-m">{tx("Invoices")}</h3><button className="btn btn-ghost btn-sm" onClick={() => onNewInvoice(p.id)}><Icon name="plus" />{tx("New invoice")}</button></div>
        {inv.length ? inv.map((i) => {
          const st = invState(i);
          return (
            <div className="switch" key={i.id}>
              <div><b className="num">#{i.number} · {money(i.amount, i.currency)}</b><span>{i.label}</span></div>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
                <Pill c={st.c}>{st.k}</Pill>
                {i.status === "sent" && <button className="btn btn-ghost btn-sm" onClick={() => invoiceAction(i, "markpaid")}>{tx("Mark paid")}</button>}
                {i.status === "draft" && <button className="btn btn-ghost btn-sm" onClick={() => invoiceAction(i, "send")}>{tx("Send")}</button>}
              </div>
            </div>
          );
        }) : <p className="sub">{tx("No invoices yet.")}</p>}
      </section>
      <section className="card">
        <h3 className="h-m" style={{ marginBottom: 6 }}>{tx("Client")}</h3>
        <div className="who"><Avatar name={c.name} /><div><b>{c.name}</b><small>{[c.email, c.phone].filter(Boolean).join(" · ")}</small></div></div>
      </section>
      {confirmDelete ? (
        <div className="card" style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", borderColor: "var(--danger)" }}>
          <p style={{ flex: 1, minWidth: 200 }}>{tx("Delete this project? Its invoices stay but lose the link.")}</p>
          <button className="btn btn-ghost btn-sm" onClick={() => setConfirmDelete(false)}>{tx("Keep it")}</button>
          <button className="btn btn-sm" style={{ background: "var(--danger-tint)", color: "var(--danger)" }} onClick={async () => { await remove("projects", p.id); toast(tx("Project deleted")); onClose(); }}>{tx("Delete project")}</button>
        </div>
      ) : <button className="btn btn-ghost" style={{ alignSelf: "flex-start", color: "var(--danger)" }} onClick={() => setConfirmDelete(true)}>{tx("Delete project")}</button>}
    </Drawer>
  );
}
