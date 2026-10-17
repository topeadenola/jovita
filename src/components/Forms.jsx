import { useMemo, useState } from "react";
import { useData } from "../lib/data";
import { CURRENCIES, PROJECT_TYPES, SYM, addDays, first, money } from "../lib/format";
import { CloseBtn, Modal, useToast } from "./ui";
import { tx } from "../lib/i18n";

function FormModal({ title, onClose, onSubmit, submitLabel, children, wide }) {
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setErr(""); setBusy(true);
    try { await onSubmit(); } catch (x) { setErr(x.message || String(x)); } finally { setBusy(false); }
  };
  return (
    <Modal label={title} onClose={onClose} wide={wide}>
      <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
          <h2 className="h-l">{title}</h2><CloseBtn onClick={onClose} />
        </div>
        {children}
        {err && <p className="err" role="alert">{err}</p>}
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", flexWrap: "wrap" }}>
          <button type="button" className="btn btn-ghost" data-dismiss onClick={onClose}>{tx("Cancel")}</button>
          <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? tx("Saving…") : submitLabel || tx("Save")}</button>
        </div>
      </form>
    </Modal>
  );
}

const CurrencySelect = ({ id, value, onChange }) => (
  <select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
    {CURRENCIES.map((c) => <option key={c} value={c}>{c} ({SYM[c]})</option>)}
  </select>
);

export function ClientForm({ onClose }) {
  const { insert } = useData();
  const toast = useToast();
  const [f, setF] = useState({ name: "", email: "", phone: "", city: "", status: "lead" });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <FormModal title={tx("Add a client")} onClose={onClose} onSubmit={async () => {
      if (!f.name.trim()) throw new Error(tx("Add the client's name."));
      await insert("clients", { ...f, name: f.name.trim() });
      toast(tx("{name} added", {
        name: f.name
      })); onClose();
    }}>
      <div className="form-grid">
        <div className="field"><label htmlFor="c-name">{tx("Full name")}</label><input id="c-name" autoFocus value={f.name} onChange={set("name")} placeholder={tx("e.g. Bisi Ojo")} /></div>
        <div className="field"><label htmlFor="c-city">{tx("City")}</label><input id="c-city" value={f.city} onChange={set("city")} placeholder={tx("Lagos")} /></div>
      </div>
      <div className="form-grid">
        <div className="field"><label htmlFor="c-email">{tx("Email")}</label><input id="c-email" type="email" value={f.email} onChange={set("email")} placeholder={tx("bisi@example.com")} /></div>
        <div className="field"><label htmlFor="c-phone">{tx("Phone / WhatsApp")}</label><input id="c-phone" value={f.phone} onChange={set("phone")} placeholder="+234 …" /></div>
      </div>
      <div className="field"><label htmlFor="c-status">{tx("Status")}</label>
        <select id="c-status" value={f.status} onChange={set("status")}><option value="lead">{tx("Lead")}</option><option value="client">{tx("Client")}</option></select></div>
    </FormModal>
  );
}

export function ProjectForm({ pre, onClose, onCreated }) {
  const { insert, clients, templates, studio } = useData();
  const toast = useToast();
  const contracts = templates.filter((t) => t.kind === "contract");
  const releases = templates.filter((t) => t.kind === "model_release");
  const [f, setF] = useState({
    client_id: pre || clients[0]?.id || "", title: "", type: "Portrait", session_date: addDays(14), amount: "", currency: studio.home_currency,
    contract_template_id: (contracts.find((t) => t.is_default) || contracts[0])?.id || "",
    release_template_id: (releases.find((t) => t.is_default) || releases[0])?.id || "",
  });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  if (!clients.length) {
    return (
      <FormModal title={tx("New project")} onClose={onClose} onSubmit={async () => onClose()} submitLabel="OK">
        <p className="sub">{tx("Add a client first, then create a project for them.")}</p>
      </FormModal>
    );
  }
  return (
    <FormModal title={tx("New project")} onClose={onClose} onSubmit={async () => {
      if (!f.title.trim()) throw new Error(tx("Say what the job is, e.g. Engagement shoot."));
      const p = await insert("projects", {
        ...f, title: f.title.trim(), amount: Number(f.amount) || 0,
        session_date: f.session_date || null,
        contract_template_id: f.contract_template_id || null, release_template_id: f.release_template_id || null,
      });
      toast(tx("Project created. Next: send a quote."));
      onCreated ? onCreated(p) : onClose();
    }}>
      <div className="field"><label htmlFor="p-client">{tx("Client")}</label>
        <select id="p-client" value={f.client_id} onChange={set("client_id")}>{clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
      <div className="form-grid">
        <div className="field"><label htmlFor="p-title">{tx("What's the job?")}</label><input id="p-title" autoFocus value={f.title} onChange={set("title")} placeholder={tx("e.g. Engagement shoot")} /></div>
        <div className="field"><label htmlFor="p-type">{tx("Type")}</label><select id="p-type" value={f.type} onChange={set("type")}>{PROJECT_TYPES.map((t) => <option key={t} value={t}>{tx(t)}</option>)}</select></div>
      </div>
      <div className="form-grid">
        <div className="field"><label htmlFor="p-date">{tx("Session date")}</label><input id="p-date" type="date" value={f.session_date} onChange={set("session_date")} /></div>
        <div className="field"><label htmlFor="p-amount">{tx("Fee")}</label><input id="p-amount" type="number" min="0" value={f.amount} onChange={set("amount")} placeholder="250000" /></div>
        <div className="field"><label htmlFor="p-cur">{tx("Currency")}</label><CurrencySelect id="p-cur" value={f.currency} onChange={(v) => setF({ ...f, currency: v })} /></div>
      </div>
      <div className="form-grid">
        <div className="field"><label htmlFor="p-contract">{tx("Contract")}</label>
          <select id="p-contract" value={f.contract_template_id} onChange={set("contract_template_id")}>{contracts.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}<option value="">{tx("No contract")}</option></select></div>
        <div className="field"><label htmlFor="p-release">{tx("Model release")}</label>
          <select id="p-release" value={f.release_template_id} onChange={set("release_template_id")}>{releases.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}<option value="">{tx("Not needed")}</option></select></div>
      </div>
    </FormModal>
  );
}

// Step one of a new invoice: who it's for. Then the full editor opens, saving as you type.
export function InvoiceForm({ pre, onClose, onCreated }) {
  const { insert, clients, projects, templates, studio } = useData();
  const invTemplates = templates.filter((t) => t.kind === "invoice");
  const preProject = projects.find((p) => p.id === pre);
  const [f, setF] = useState({ client_id: preProject?.client_id || clients[0]?.id || "", project_id: preProject?.id || "", template: "" });
  const clientProjects = useMemo(() => projects.filter((p) => p.client_id === f.client_id), [projects, f.client_id]);
  if (!clients.length) return <FormModal title={tx("New invoice")} onClose={onClose} onSubmit={async () => onClose()} submitLabel="OK"><p className="sub">{tx("Add a client first.")}</p></FormModal>;
  const create = async () => {
    const t = invTemplates.find((x) => x.id === f.template);
    const p = projects.find((x) => x.id === f.project_id);
    const uid = () => Math.random().toString(36).slice(2, 9);
    const items = t ? (t.items || []).map((it) => ({ id: uid(), name: it.name || "", description: it.description || "", qty: it.qty ?? 1, price: it.price ?? 0 }))
      : p ? [{ id: uid(), name: p.title, description: "", qty: 1, price: Number(p.amount) || 0 }] : [{ id: uid(), name: "", description: "", qty: 1, price: 0 }];
    const total = items.reduce((s2, it) => s2 + Number(it.qty || 0) * Number(it.price || 0), 0);
    const inv = await insert("invoices", {
      client_id: f.client_id, project_id: f.project_id || null, label: t?.name || p?.title || tx("Invoice"), amount: total,
      currency: t?.currency || p?.currency || studio.home_currency, due_date: addDays(14), status: "draft", items,
      methods: ["transfer", "paystack", "flutterwave", "stripe", "paypal"].filter((m) => studio["pay_" + m]),
    });
    onCreated ? onCreated(inv.id) : onClose();
  };
  return (
    <FormModal title={tx("Create a new invoice")} onClose={onClose} submitLabel={tx("Next")} onSubmit={create}>
      <div className="field"><label htmlFor="i-client">{tx("Client")}</label>
        <select id="i-client" value={f.client_id} onChange={(e) => setF({ ...f, client_id: e.target.value, project_id: "" })}>{clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
      <div className="field"><label htmlFor="i-project">{tx("Project")}</label>
        <select id="i-project" value={f.project_id} onChange={(e) => setF({ ...f, project_id: e.target.value })}><option value="">{tx("No project")}</option>{clientProjects.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}</select></div>
      {invTemplates.length > 0 && (
        <div className="field"><label htmlFor="i-tpl">{tx("Start from a package")}</label>
          <select id="i-tpl" value={f.template} onChange={(e) => setF({ ...f, template: e.target.value })}>
            <option value="">{tx("Blank invoice")}</option>
            {invTemplates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select><span className="help">{tx("Edit packages in Settings › Templates.")}</span></div>
      )}
      <p className="sub" style={{ fontSize: 13 }}>{tx("Next, the full invoice opens. It saves as you type.")}</p>
    </FormModal>
  );
}

export function SessionForm({ onClose }) {
  const { insert, studio } = useData();
  const toast = useToast();
  const [f, setF] = useState({ name: "", length_label: "1 hour", price: "", currency: studio.home_currency, availability: "Mon–Fri" });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <FormModal title={tx("New session type")} onClose={onClose} onSubmit={async () => {
      if (!f.name.trim()) throw new Error(tx("Give the session a name."));
      await insert("session_types", { ...f, name: f.name.trim(), price: Number(f.price) || 0 });
      toast(tx("Session type added")); onClose();
    }}>
      <div className="field"><label htmlFor="s-name">{tx("Name")}</label><input id="s-name" autoFocus value={f.name} onChange={set("name")} placeholder={tx("e.g. Headshots")} /></div>
      <div className="form-grid">
        <div className="field"><label htmlFor="s-len">{tx("Length")}</label><input id="s-len" value={f.length_label} onChange={set("length_label")} /></div>
        <div className="field"><label htmlFor="s-price">{tx("Price")}</label><input id="s-price" type="number" min="0" value={f.price} onChange={set("price")} /></div>
        <div className="field"><label htmlFor="s-cur">{tx("Currency")}</label><CurrencySelect id="s-cur" value={f.currency} onChange={(v) => setF({ ...f, currency: v })} /></div>
      </div>
      <div className="field"><label htmlFor="s-av">{tx("When you're available")}</label><input id="s-av" value={f.availability} onChange={set("availability")} /></div>
    </FormModal>
  );
}
