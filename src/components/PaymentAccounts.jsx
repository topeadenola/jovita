import { useCallback, useEffect, useState } from "react";
import { supabase } from "../supabase";
import { useData } from "../lib/data";
import { ORDER, PROVIDERS, bankText, isTest, mask } from "../lib/payments";
import { tx } from "../lib/i18n";
import { CloseBtn, Modal, Toggle, useToast } from "./ui";
import Icon from "./Icon";

const COLS = "id, studio_id, provider, enabled, label, public_key, details, secret_hint, test_mode, connected_at";
const LOGO = { paystack: ["P", "#0BA4DB"], flutterwave: ["F", "#F5A623"], paypal: ["P", "#003087"], stripe: ["S", "#635BFF"], bank: ["₦", "#261433"] };

function ConnectForm({ provider, account, onClose, onSaved }) {
  const { studio } = useData();
  const toast = useToast();
  const P = PROVIDERS[provider];
  const [f, setF] = useState(() => {
    const x = { public_key: account?.public_key || "", secret: "", test_mode: account?.test_mode || false, label: account?.label || "" };
    P.fields.filter((fl) => fl.detail).forEach((fl) => { x[fl.k] = account?.details?.[fl.k] || (fl.k === "currency" ? studio.home_currency : ""); });
    return x;
  });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value, ...(k === "public_key" && isTest(e.target.value) ? { test_mode: true } : {}) }));
  const save = async (e) => {
    e.preventDefault();
    for (const fl of P.fields) {
      const v = (f[fl.k] || "").trim();
      if (fl.secret && account && !v) continue; // keep the saved secret
      if ((fl.required || (!fl.detail)) && !v) return toast(tx("Add the {field}.", { field: tx(fl.label) }));
      if (fl.re && v && !fl.re.test(v)) return toast(tx("That {field} doesn't look right. Copy it again from {where}.", { field: tx(fl.label), where: P.help }));
    }
    setBusy(true);
    try {
      const details = {};
      P.fields.filter((fl) => fl.detail).forEach((fl) => { details[fl.k] = (f[fl.k] || "").trim(); });
      const row = { provider, public_key: f.public_key.trim(), details, test_mode: !!f.test_mode, label: provider === "bank" ? `${details.bank_name} · ${details.currency || ""}`.trim() : P.name };
      if (f.secret.trim()) { row.secret = f.secret.trim(); row.secret_hint = "…" + f.secret.trim().slice(-4); }
      const q = account ? supabase.from("payment_accounts").update(row).eq("id", account.id) : supabase.from("payment_accounts").insert({ ...row, studio_id: studio.id, enabled: true });
      const { error } = await q;
      if (error) throw error;
      toast(account ? tx("{name} updated", { name: P.name }) : tx("{name} connected and switched on", { name: P.name }), true);
      onSaved();
    } catch (x) { toast(/duplicate|unique/i.test(x.message) ? tx("{name} is already connected.", { name: P.name }) : x.message); setBusy(false); }
  };
  return (
    <Modal label={tx("Connect {name}", { name: P.name })} onClose={onClose}>
      <form className="stack" onSubmit={save}>
        <div className="set-head"><h2 className="h-l">{account ? tx("Edit {name}", { name: P.name }) : tx("Connect {name}", { name: P.name })}</h2><CloseBtn onClick={onClose} /></div>
        {P.help && <p className="sub">{tx("Find these in {where}. Money goes straight to your own {name} account; Jovita never holds it.", { where: P.help, name: P.name })}</p>}
        {provider === "bank" && <p className="sub">{tx("Clients see these details when they choose bank transfer, with the invoice number as the reference.")}</p>}
        {P.fields.map((fl) => (
          <div className="field" key={fl.k}><label htmlFor={`pa-${fl.k}`}>{tx(fl.label)}</label>
            {fl.select ? <select id={`pa-${fl.k}`} value={f[fl.k]} onChange={set(fl.k)}>{fl.select.map((c) => <option key={c}>{c}</option>)}</select>
              : <input id={`pa-${fl.k}`} type={fl.secret ? "password" : "text"} autoComplete="off" spellCheck={false} value={f[fl.k]} onChange={set(fl.k)} placeholder={fl.secret && account?.secret_hint ? tx("Saved ({hint}). Leave blank to keep it.", { hint: account.secret_hint }) : fl.ph} />}
            {fl.secret && <span className="help">{tx("Stored safely and never shown again, not even to you.")}</span>}
          </div>
        ))}
        {provider !== "bank" && <label className="check"><input type="checkbox" checked={!!f.test_mode} onChange={(e) => setF((x) => ({ ...x, test_mode: e.target.checked }))} /> {tx("These are test keys (no real money)")}</label>}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}><button type="button" className="btn btn-ghost" data-dismiss>{tx("Cancel")}</button><button className="btn btn-primary" disabled={busy}>{busy ? tx("Saving…") : account ? tx("Save") : tx("Connect")}</button></div>
      </form>
    </Modal>
  );
}

// Settings › Payments: connect your own accounts, switch each on or off, or disconnect.
export default function PaymentAccounts() {
  const { studio, updateStudio } = useData();
  const toast = useToast();
  const [rows, setRows] = useState(null);
  const [missing, setMissing] = useState(false);
  const [form, setForm] = useState(null); // { provider, account? }

  const load = useCallback(async () => {
    const { data, error } = await supabase.from("payment_accounts").select(COLS).eq("studio_id", studio.id).order("connected_at", { ascending: true });
    if (error) { setMissing(true); setRows([]); return; }
    setRows(data || []);
  }, [studio.id]);
  useEffect(() => { load(); }, [load]);

  // Keep the studio's quick flags (used by invoices and the client page) in step with connected accounts
  const sync = async (list) => {
    const patch = {};
    ORDER.forEach((p) => { const on = list.some((a) => a.provider === p && a.enabled); if (!!studio[PROVIDERS[p].flag] !== on) patch[PROVIDERS[p].flag] = on; });
    const banks = list.filter((a) => a.provider === "bank" && a.enabled);
    const text = banks.map((a) => bankText(a.details)).join("\n\n");
    if (banks.length && text !== studio.bank_details) patch.bank_details = text;
    if (Object.keys(patch).length) await updateStudio(patch).catch(() => {});
  };
  const reload = async () => { const { data } = await supabase.from("payment_accounts").select(COLS).eq("studio_id", studio.id).order("connected_at", { ascending: true }); setRows(data || []); await sync(data || []); };

  const toggle = async (a, on) => {
    const { error } = await supabase.from("payment_accounts").update({ enabled: on }).eq("id", a.id);
    if (error) return toast(error.message);
    toast(on ? tx("{name} on. Clients can pay this way.", { name: a.label || PROVIDERS[a.provider].name }) : tx("{name} off. Clients won't see it.", { name: a.label || PROVIDERS[a.provider].name }));
    reload();
  };
  const disconnect = async (a) => {
    const name = a.label || PROVIDERS[a.provider].name;
    if (!window.confirm(tx("Disconnect {name}? Its keys are deleted from Jovita and clients can no longer pay this way. You can connect again any time.", { name }))) return;
    const { error } = await supabase.from("payment_accounts").delete().eq("id", a.id);
    if (error) return toast(error.message);
    toast(tx("{name} disconnected", { name }));
    reload();
  };

  if (missing) return (
    <section className="card set-card">
      <h2 className="h-m">{tx("How clients can pay you")}</h2>
      <div className="ge-note"><Icon name="lock" /><span>{tx("Run the latest Jovita update in Supabase (RUN-THIS-IN-SUPABASE.sql) to connect your own Paystack, Flutterwave, PayPal, Stripe and bank accounts.")}</span></div>
    </section>
  );

  const card = (p, a) => {
    const P = PROVIDERS[p];
    const [ch, col] = LOGO[p];
    return (
      <div className={`pay-acct ${a ? "on" : ""}`} key={a?.id || p}>
        <span className="pay-logo" style={{ background: col }} aria-hidden="true">{ch}</span>
        <div className="pay-body">
          <b>{a && p === "bank" ? a.label : P.name}{a?.test_mode && <span className="pill p-warning" style={{ marginLeft: 8 }}>{tx("Test mode")}</span>}</b>
          <span>{a ? (p === "bank" ? `${a.details?.account_name || ""} · ${a.details?.account_number ? "…" + String(a.details.account_number).slice(-4) : ""}` : `${tx("Connected")} · ${mask(a.public_key)}`) : tx(P.blurb)}</span>
          {a && P.currencies && <small className="sub">{tx("Takes {list}", { list: P.currencies.join(", ") })}</small>}
        </div>
        {a ? (
          <div className="pay-acts">
            <Toggle on={a.enabled} label={tx("Accept {name}", { name: P.name })} onChange={(v) => toggle(a, v)} />
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setForm({ provider: p, account: a })}>{tx("Edit")}</button>
            <button type="button" className="btn btn-ghost btn-sm pay-dis" onClick={() => disconnect(a)}>{tx("Disconnect")}</button>
          </div>
        ) : <button type="button" className="btn btn-secondary btn-sm" onClick={() => setForm({ provider: p })}><Icon name="link" />{tx("Connect")}</button>}
      </div>
    );
  };
  const list = rows || [];
  const banks = list.filter((a) => a.provider === "bank");
  return (
    <>
      <section className="card set-card">
        <h2 className="h-m">{tx("How clients can pay you")}</h2>
        <p className="sub">{tx("Connect your own accounts. Money goes straight to you. Switch each one on or off, or disconnect it any time.")}</p>
        {rows === null ? <p className="sub">{tx("Loading…")}</p> : ORDER.filter((p) => p !== "bank").map((p) => card(p, list.find((a) => a.provider === p)))}
      </section>
      <section className="card set-card">
        <div className="set-head"><h2 className="h-m">{tx("Bank accounts")}</h2><button type="button" className="btn btn-secondary btn-sm" onClick={() => setForm({ provider: "bank" })}><Icon name="plus" />{tx("Add bank account")}</button></div>
        <p className="sub">{tx("Add one for each currency you get paid in. Clients see the details when they choose bank transfer.")}</p>
        {banks.length ? banks.map((a) => card("bank", a)) : <p className="sub" style={{ fontSize: 14 }}>{tx("No bank account added yet.")}</p>}
      </section>
      {form && <ConnectForm provider={form.provider} account={form.account} onClose={() => setForm(null)} onSaved={() => { setForm(null); reload(); }} />}
    </>
  );
}
