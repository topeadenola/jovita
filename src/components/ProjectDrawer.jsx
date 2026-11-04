import { useState } from "react";
import { useData } from "../lib/data";
import { useActions } from "../lib/actions";
import { PROJECT_TYPES, STAGES, STAGE_LABEL, first, fday, ftime, invState, money, nextStep, portalUrl, projPill } from "../lib/format";
import { CurrencySelect } from "./Forms";
import Icon from "./Icon";
import { Avatar, CloseBtn, CopyBox, Drawer, MoneyInput, Pill, useToast } from "./ui";
import { tx } from "../lib/i18n";
import { useUi } from "./Shell";
import { fill, values } from "../lib/merge";
import SendContract from "./SendContract";

export default function ProjectDrawer({ id, onClose, onNewInvoice }) {
  const { project, client, invoices, templates, update, remove, studio, bookings = [] } = useData();
  const { projectAction, invoiceAction } = useActions();
  const toast = useToast();
  const ui = useUi();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showContract, setShowContract] = useState(false);
  const [sendingContract, setSendingContract] = useState(false);
  const [delDocs, setDelDocs] = useState(false);
  const p = project(id);
  const [f, setF] = useState(() => p ? { title: p.title, type: p.type, session_date: p.session_date || "", amount: String(Number(p.amount) || ""), currency: p.currency } : null);
  const [saving, setSaving] = useState(false);
  if (!p) return null;
  const c = client(p.client_id);
  const n = nextStep(p);
  const pill = projPill(p);
  const inv = invoices.filter((i) => i.project_id === p.id);
  const invTotal = inv.filter((i) => i.kind !== "quote" && i.status !== "cancelled" && i.status !== "draft" && i.currency === p.currency).reduce((a, i) => a + Number(i.amount || 0), 0);
  const contracts = templates.filter((t) => t.kind === "contract");
  const releases = templates.filter((t) => t.kind === "model_release");
  const steps = [
    [tx("Inquiry and quote"), p.stage !== "inquiry", p.stage !== "inquiry" ? tx("Quote accepted") : tx("Send a quote")],
    [tx("Contract signed"), p.contract_signed, p.contract_signed ? tx("Signed by {name}", { name: p.contract_signed_name || c.name }) + (p.contract_signed_at ? ` · ${fday(p.contract_signed_at)}, ${ftime(p.contract_signed_at)}` : "") : p.contract_template_id ? tx("Waiting for {name}", { name: first(c.name) }) : tx("No contract on this project")],
    ...(p.release_template_id ? [[tx("Model release"), p.release_signed, p.release_signed ? tx("Signed by {name}", { name: p.release_signed_name }) + (p.release_signed_at ? ` · ${fday(p.release_signed_at)}, ${ftime(p.release_signed_at)}` : "") : tx("Optional, signed in the portal")]] : []),
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
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}><Pill c={pill.c}>{pill.k}</Pill><Pill c="p-neutral">{money(p.amount, p.currency)}</Pill>
        <span style={{ flex: 1 }} />
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => { const el = document.getElementById("pd-title"); el?.scrollIntoView({ behavior: "smooth", block: "center" }); setTimeout(() => el?.focus(), 350); }}><Icon name="edit" />{tx("Edit")}</button>
        {!p.contract_signed && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSendingContract(true)}><Icon name="send" />{tx("Send contract")}</button>}
        <button type="button" className="btn btn-ghost btn-sm" style={{ color: "var(--danger)" }} onClick={() => { setConfirmDelete(true); setTimeout(() => document.getElementById("pd-delete")?.scrollIntoView({ behavior: "smooth", block: "center" }), 50); }}><Icon name="trash" />{tx("Delete")}</button></div>
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
      <form className="card" style={{ display: "flex", flexDirection: "column", gap: 12 }} onSubmit={async (e) => {
        e.preventDefault();
        if (!f.title.trim()) return toast(tx("Say what the job is, e.g. Engagement shoot."));
        setSaving(true);
        await set({ title: f.title.trim(), type: f.type, session_date: f.session_date || null, amount: Number(f.amount) || 0, currency: f.currency }, tx("Project saved"));
        setSaving(false);
      }}>
        <h3 className="h-m">{tx("Details")}</h3>
        <div className="form-grid">
          <div className="field"><label htmlFor="pd-title">{tx("What's the job?")}</label><input id="pd-title" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></div>
          <div className="field"><label htmlFor="pd-type">{tx("Type")}</label><select id="pd-type" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>{[...new Set([...PROJECT_TYPES, f.type])].map((t) => <option key={t} value={t}>{tx(t)}</option>)}</select></div>
          <div className="field"><label htmlFor="pd-date">{tx("Session date")}</label><input id="pd-date" type="date" value={f.session_date} onChange={(e) => setF({ ...f, session_date: e.target.value })} /></div>
          <div className="field"><label htmlFor="pd-fee">{tx("Fee")}</label><MoneyInput id="pd-fee" value={f.amount} onChange={(v) => setF({ ...f, amount: v })} />
            {invTotal > 0 && Math.round(invTotal) !== Math.round(Number(f.amount) || 0) && <span className="help">{tx("Invoiced so far: {amt}.", { amt: money(invTotal, p.currency) })} <button type="button" className="linkish" onClick={() => setF({ ...f, amount: String(invTotal) })}>{tx("Use this")}</button></span>}</div>
          <div className="field"><label htmlFor="pd-cur">{tx("Currency")}</label><CurrencySelect id="pd-cur" value={f.currency} onChange={(v) => setF({ ...f, currency: v })} /></div>
        </div>
        <button className="btn btn-primary" style={{ alignSelf: "flex-start" }} disabled={saving}>{saving ? tx("Saving…") : tx("Save")}</button>
      </form>
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
            {p.contract_signed && <span className="help">{tx("Signed, so it can't be changed.")}</span>}
            {!p.contract_signed && contracts.length > 0 && <span className="help">{tx("{name}'s name, address, fee and date fill in by themselves.", { name: first(c.name) })}{" "}<button type="button" className="linklike" onClick={() => setShowContract((v) => !v)}>{showContract ? tx("Hide") : tx("Preview")}</button>{" · "}<button type="button" className="linklike" onClick={() => setSendingContract(true)}>{tx("Send it")}</button></span>}</div>
          <div className="field"><label htmlFor="pd-release">{tx("Model release")}</label>
            <select id="pd-release" value={p.release_template_id || ""} disabled={p.release_signed} onChange={(e) => set({ release_template_id: e.target.value || null }, tx("Model release updated"))}>
              {releases.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}<option value="">{tx("Not needed")}</option></select></div>
        </div>
        {showContract && (() => {
          const t = contracts.find((x) => x.id === p.contract_template_id) || contracts.find((x) => x.is_default) || contracts[0];
          const b = bookings.filter((x) => x.project_id === p.id).sort((x, y) => (x.starts_at > y.starts_at ? 1 : -1))[0];
          return t ? <div className="contract-text" style={{ whiteSpace: "pre-wrap", maxHeight: 320, overflow: "auto" }}>{fill(t.body, values({ studio, client: c, project: p, booking: b }))}</div> : null;
        })()}
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
        <div id="pd-delete" className="card" style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", borderColor: "var(--danger)" }}>
          <p style={{ flex: 1, minWidth: 200 }}>{tx("Delete this project? This can't be undone.")}</p>
          {inv.length > 0 && <label className="check" style={{ flexBasis: "100%" }}><input type="checkbox" checked={delDocs} onChange={(e) => setDelDocs(e.target.checked)} />{tx("Also delete its {n} quotes and invoices", { n: inv.length })}</label>}
          <button className="btn btn-ghost btn-sm" onClick={() => setConfirmDelete(false)}>{tx("Keep it")}</button>
          <button className="btn btn-sm" style={{ background: "var(--danger-tint)", color: "var(--danger)" }} onClick={async () => {
            const docs = delDocs ? inv.map((i) => i.id) : [];
            onClose();
            try {
              for (const id2 of docs) await remove("invoices", id2);
              await remove("projects", p.id); toast(tx("Project deleted"));
            } catch (x) { toast(x.message); }
          }}>{tx("Delete project")}</button>
        </div>
      ) : <button className="btn btn-ghost" style={{ alignSelf: "flex-start", color: "var(--danger)" }} onClick={() => setConfirmDelete(true)}>{tx("Delete project")}</button>}
      {sendingContract && <SendContract clientId={p.client_id} projectId={p.id} onClose={() => setSendingContract(false)} />}
    </Drawer>
  );
}
