import { useEffect, useMemo, useState } from "react";
import { useData } from "../lib/data";
import { useActions } from "../lib/actions";
import { SaveState, useAutosave } from "../lib/autosave";
import { addDays, balanceOf, CURRENCIES, daysFrom, fdate, invState, isoDay, money, SYM } from "../lib/format";
import { tx } from "../lib/i18n";
import { Avatar, Modal, MoneyInput, Pill, Toggle, useToast } from "./ui";
import Icon, { Mark } from "./Icon";
import StudioLogo from "./StudioLogo";

const uid = () => Math.random().toString(36).slice(2, 9);
const n = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const REMIND = [[-7, "7 days before"], [0, "On due date"], [3, "3 days after"], [7, "7 days after"], [14, "14 days after"]];
const METHODS = [["transfer", "Bank transfer", "pay_transfer"], ["paystack", "Paystack", "pay_paystack"], ["flutterwave", "Flutterwave", "pay_flutterwave"], ["stripe", "Card (Stripe)", "pay_stripe"], ["paypal", "PayPal", "pay_paypal"]];

export function totals(d) {
  const subtotal = (d.items || []).reduce((s, it) => s + n(it.qty) * n(it.price), 0);
  const discount = d.discount_type === "percent" ? subtotal * n(d.discount) / 100 : n(d.discount);
  const taxed = Math.max(0, subtotal - discount);
  const tax = taxed * n(d.tax_rate) / 100;
  return { subtotal, discount, tax, total: Math.round((taxed + tax) * 100) / 100 };
}

// Turn a stored invoice into an editable draft (older invoices only had a label and amount)
function toDraft(i) {
  const items = Array.isArray(i.items) && i.items.length ? i.items : [{ id: uid(), name: i.label || "", description: "", qty: 1, price: Number(i.amount) || 0 }];
  return {
    client_id: i.client_id, project_id: i.project_id || "", label: i.label || "", currency: i.currency, due_date: i.due_date,
    items: items.map((it) => ({ id: it.id || uid(), name: it.name || "", description: it.description || "", qty: it.qty ?? 1, price: it.price ?? 0 })),
    notes: i.notes || "", discount: i.discount || 0, discount_type: i.discount_type || "amount", tax_rate: i.tax_rate || 0,
    schedule: Array.isArray(i.schedule) ? i.schedule : [], methods: Array.isArray(i.methods) ? i.methods : ["transfer"],
    reminders_on: i.reminders_on ?? true, reminder_days: i.reminder_days || [-7, 0, 3, 7, 14], allow_tip: !!i.allow_tip,
  };
}

function Field({ label, children, help, id }) {
  return <div className="field"><label htmlFor={id}>{label}</label>{children}{help && <span className="help">{help}</span>}</div>;
}

function Preview({ d, t, inv }) {
  const { studio, client } = useData();
  const c = client(d.client_id);
  return (
    <div className="doc inv-doc">
      <div className="doc-head"><StudioLogo studio={studio} />
        <div style={{ flex: 1 }}><b>{studio.name}</b><br /><span className="sub" style={{ fontSize: 13 }}>{inv.kind === "quote" ? tx("Quote #{number}", { number: inv.number }) : tx("Invoice #{number}", { number: inv.number })}</span></div>
        <div style={{ textAlign: "right" }}><span className="sub" style={{ fontSize: 12 }}>{inv.kind === "quote" ? tx("Valid until") : tx("Due")}</span><br /><b>{fdate(d.due_date)}</b></div></div>
      <div><span className="sub" style={{ fontSize: 12 }}>{tx("Bill to")}</span><br /><b>{c.name}</b>{c.email ? <><br /><span className="sub" style={{ fontSize: 13 }}>{c.email}</span></> : null}</div>
      <table className="doc-table"><tbody>
        {d.items.map((it) => (
          <tr key={it.id}><td><b>{it.name || tx("Item")}</b>{it.description && <div className="sub" style={{ fontSize: 12, whiteSpace: "pre-line" }}>{it.description}</div>}</td>
            <td className="right" style={{ whiteSpace: "nowrap" }}>{n(it.qty)} × {money(it.price, d.currency)}</td><td className="right"><b>{money(n(it.qty) * n(it.price), d.currency)}</b></td></tr>
        ))}
        <tr><td colSpan={2} className="right">{tx("Subtotal")}</td><td className="right">{money(t.subtotal, d.currency)}</td></tr>
        {t.discount > 0 && <tr><td colSpan={2} className="right">{tx("Discount")}</td><td className="right">− {money(t.discount, d.currency)}</td></tr>}
        {t.tax > 0 && <tr><td colSpan={2} className="right">{tx("Tax ({rate}%)", { rate: d.tax_rate })}</td><td className="right">{money(t.tax, d.currency)}</td></tr>}
        <tr><td colSpan={2} className="right"><b>{tx("Total")}</b></td><td className="right"><b style={{ fontSize: 18 }}>{money(t.total, d.currency)}</b></td></tr>
        {Number(inv.amount_paid) > 0 && <>
          <tr><td colSpan={2} className="right">{tx("Paid so far")}</td><td className="right">− {money(inv.amount_paid, d.currency)}</td></tr>
          <tr><td colSpan={2} className="right"><b>{tx("Balance due")}</b></td><td className="right"><b>{money(Math.max(0, t.total - Number(inv.amount_paid)), d.currency)}</b></td></tr></>}
      </tbody></table>
      {d.schedule.length > 1 && (
        <div><b style={{ fontSize: 13 }}>{tx("Payment schedule")}</b>
          {schedRows(d, t).map((r, i) => <div key={i} className="doc-sign" style={{ borderTop: 0, paddingTop: 4 }}><span>{tx("Payment {a} of {b}", { a: i + 1, b: d.schedule.length })} · {r.due ? fdate(r.due) : tx("On receipt")}</span><b>{money(r.amount, d.currency)}</b></div>)}
        </div>
      )}
      {d.notes && <div className="doc-text" style={{ fontSize: 13 }}>{d.notes}</div>}
      <div className="doc-sign"><span>{tx("Pay by")}: {d.methods.map((m) => tx((METHODS.find((x) => x[0] === m) || [m, m])[1])).join(", ") || "—"}</span><Mark dot="#261433" style={{ width: 14, height: 20 }} /></div>
    </div>
  );
}

// Schedule rows hold a percent; the last row takes whatever is left so it always adds up
function schedRows(d, t) {
  let used = 0;
  return d.schedule.map((r, i) => {
    const last = i === d.schedule.length - 1;
    const pct = last ? Math.max(0, 100 - used) : n(r.percent);
    used += last ? 0 : n(r.percent);
    return { ...r, percent: pct, amount: Math.round(t.total * pct) / 100 };
  });
}

const PAY_WAYS = ["Bank transfer", "Cash", "Card", "Paystack", "Flutterwave", "Stripe", "PayPal", "Other"];

// Record money you've received outside Jovita, e.g. a deposit by bank transfer. Fully paid → the invoice is marked paid.
function RecordPayment({ inv, total, onClose, onDone }) {
  const { update, client } = useData();
  const { invoiceAction } = useActions();
  const toast = useToast();
  const owed = Math.max(0, Math.round((total - Number(inv.amount_paid || 0)) * 100) / 100);
  const [f, setF] = useState({ amount: String(owed), date: isoDay(new Date()), method: "Bank transfer", note: "" });
  const [busy, setBusy] = useState(false);
  const save = async (e) => {
    e.preventDefault();
    const amt = Math.round(n(f.amount) * 100) / 100;
    if (!(amt > 0)) return toast(tx("Add the amount you received."));
    if (amt > owed + 0.001) return toast(tx("That's more than the {owed} still owed.", { owed: money(owed, inv.currency) }));
    setBusy(true);
    try {
      const payments = [...(Array.isArray(inv.payments) ? inv.payments : []), { id: uid(), amount: amt, date: f.date, method: f.method, note: f.note.trim() }];
      const paid = Math.round((Number(inv.amount_paid || 0) + amt) * 100) / 100;
      await update("invoices", inv.id, { payments, amount_paid: paid, payment_method: f.method });
      if (inv.project_id) await update("projects", inv.project_id, { deposit_paid: true }).catch(() => {});
      if (paid >= total - 0.001) { await invoiceAction({ ...inv, amount: total, amount_paid: paid }, "markpaid"); }
      else toast(tx("{amount} recorded. {balance} still to pay.", { amount: money(amt, inv.currency), balance: money(total - paid, inv.currency) }), true);
      onDone?.();
      onClose();
    } catch (x) { toast(x.message); } finally { setBusy(false); }
  };
  return (
    <Modal label={tx("Record a payment")} onClose={onClose}>
      <form className="stack" onSubmit={save}>
        <h2 className="h-m">{tx("Record a payment")}</h2>
        <p className="sub" style={{ fontSize: 13 }}>{tx("{name} still owes {owed} on invoice #{number}.", { name: client(inv.client_id).name, owed: money(owed, inv.currency), number: inv.number })}</p>
        <div className="form-grid">
          <div className="field"><label htmlFor="rp-amt">{tx("Amount received")}</label><label className="inv-price"><span>{SYM[inv.currency] || ""}</span><MoneyInput id="rp-amt" value={f.amount} onChange={(v) => setF({ ...f, amount: v })} autoFocus /></label></div>
          <div className="field"><label htmlFor="rp-date">{tx("Date")}</label><input id="rp-date" type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></div>
        </div>
        <div className="chips">{[[0.5, "Half"], [1, "All of it"]].map(([k, l]) => <button key={l} type="button" className="chip" onClick={() => setF({ ...f, amount: String(Math.round(owed * k * 100) / 100) })}>{tx(l)}</button>)}</div>
        <div className="field"><label htmlFor="rp-m">{tx("How they paid")}</label><select id="rp-m" value={f.method} onChange={(e) => setF({ ...f, method: e.target.value })}>{PAY_WAYS.map((m) => <option key={m} value={m}>{tx(m)}</option>)}</select></div>
        <div className="field"><label htmlFor="rp-n">{tx("Note (optional)")}</label><input id="rp-n" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder={tx("e.g. Deposit")} /></div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}><button type="button" className="btn btn-ghost" onClick={onClose}>{tx("Cancel")}</button><button className="btn btn-primary" disabled={busy}>{busy ? tx("Saving…") : tx("Record payment")}</button></div>
      </form>
    </Modal>
  );
}

export default function InvoiceEditor({ id, onClose }) {
  const { invoices, clients, projects, templates, studio, client, update, remove } = useData();
  const { invoiceAction } = useActions();
  const toast = useToast();
  const inv = invoices.find((i) => i.id === id);
  const [preview, setPreview] = useState(false);
  const [menu, setMenu] = useState(false);
  const [paying, setPaying] = useState(false);
  const [copyMe, setCopyMe] = useState(!!studio.copy_me);
  const [d, setD, status, flush] = useAutosave(inv ? toDraft(inv) : null, async (v) => {
    const t = totals(v);
    const label = v.label.trim() || v.items.find((it) => it.name.trim())?.name.trim() || (inv?.kind === "quote" ? tx("Quote") : tx("Invoice"));
    await update("invoices", id, { ...v, project_id: v.project_id || null, label, amount: t.total, schedule: schedRows(v, t).map(({ id: sid, percent, due }) => ({ id: sid, percent, due: due || null })), updated_at: new Date().toISOString() });
  });

  useEffect(() => {
    const h = (e) => { if (e.key === "Escape" && !menu && !paying) { flush(); onClose(); } };
    document.addEventListener("keydown", h);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", h); document.body.style.overflow = ""; };
  }, [onClose, flush, menu, paying]);

  const t = useMemo(() => (d ? totals(d) : null), [d]);
  if (!inv || !d) return null;
  const st = invState(inv);
  const c = client(d.client_id);
  const clientProjects = projects.filter((p) => p.client_id === d.client_id);
  const packages = templates.filter((x) => x.kind === "invoice");
  const set = (k, v) => setD((x) => ({ ...x, [k]: v }));
  const setItem = (iid, k, v) => setD((x) => ({ ...x, items: x.items.map((it) => (it.id === iid ? { ...it, [k]: v } : it)) }));
  const moveItem = (iid, dir) => setD((x) => {
    const a = [...x.items]; const i = a.findIndex((it) => it.id === iid); const j = i + dir;
    if (j < 0 || j >= a.length) return x;
    [a[i], a[j]] = [a[j], a[i]]; return { ...x, items: a };
  });
  const addPackage = (tid) => {
    const p = packages.find((x) => x.id === tid); if (!p) return;
    setD((x) => ({ ...x, items: [...x.items.filter((it) => it.name || n(it.price)), ...(p.items || []).map((it) => ({ id: uid(), name: it.name || "", description: it.description || "", qty: it.qty ?? 1, price: it.price ?? 0 }))] }));
    toast(tx("Added {name}", { name: p.name }));
  };
  const rows = d.schedule.length ? schedRows(d, t) : [];
  const enabled = METHODS.filter((m) => studio[m[2]]);
  const close = async () => { await flush(); onClose(); };
  const quote = inv.kind === "quote";
  const title = quote ? tx("Quote #{number}", { number: inv.number }) : tx("Invoice #{number}", { number: inv.number });
  const send = async () => { await flush(); await invoiceAction({ ...inv, ...d, amount: t.total }, "send", { copy_me: copyMe }); onClose(); };
  const payments = Array.isArray(inv.payments) ? inv.payments : [];
  const canPay = !quote && (inv.status === "sent" || inv.status === "draft");
  // Back to unpaid: payments you recorded stay (remove any below); the rest is owed again
  const markUnpaid = async () => {
    const kept = payments.reduce((a, p) => a + Number(p.amount || 0), 0);
    if (!window.confirm(kept > 0 ? tx("Mark invoice #{number} as unpaid? The {paid} you recorded stays, so {left} will be owed again.", { number: inv.number, paid: money(kept, d.currency), left: money(Math.max(0, t.total - kept), d.currency) }) : tx("Mark invoice #{number} as unpaid? The full {total} will be owed again.", { number: inv.number, total: money(t.total, d.currency) }))) return;
    await update("invoices", id, { status: "sent", paid_at: null, amount_paid: Math.round(kept * 100) / 100 });
    toast(tx("Invoice #{number} is unpaid again", { number: inv.number }));
  };
  const removePayment = async (pm) => {
    if (!window.confirm(tx("Remove this {amount} payment?", { amount: money(pm.amount, d.currency) }))) return;
    const rest = payments.filter((x) => x !== pm);
    const paid = Math.round(rest.reduce((a, p) => a + Number(p.amount || 0), 0) * 100) / 100;
    const patch = { payments: rest, amount_paid: paid };
    if (inv.status === "paid" && paid < t.total - 0.001) Object.assign(patch, { status: "sent", paid_at: null });
    await update("invoices", id, patch);
    toast(tx("Payment removed"));
  };
  const owed = Math.max(0, t.total - Number(inv.amount_paid || 0));

  return (
    <div className="sheet-wrap" role="dialog" aria-modal="true" aria-label={title}>
      <div className="sheet">
        <header className="sheet-bar">
          <button type="button" className="x" onClick={close} aria-label={tx("Close")}><Icon name="x" /></button>
          <div className="sheet-title"><b>{title}</b><span>{c.name}{d.project_id ? " · " + (projects.find((p) => p.id === d.project_id)?.title || "") : ""}{inv.viewed_at ? " · " + tx("{name} opened it {date}", { name: c.name.split(" ")[0], date: fdate(inv.viewed_at) }) : ""}</span></div>
          <Pill c={st.c}>{tx(st.k)}</Pill>
          <SaveState status={status} />
          <span className="spacer" />
          <div className="newwrap">
            <button type="button" className="btn btn-ghost btn-sm" aria-expanded={menu} onClick={() => setMenu(!menu)}>{tx("Actions")} ▾</button>
            {menu && (
              <div className="menu" role="menu" onMouseLeave={() => setMenu(false)}>
                {canPay && <button type="button" onClick={async () => { setMenu(false); await flush(); setPaying(true); }}><Icon name="wallet" />{tx("Record a part payment")}</button>}
                {inv.status === "paid" && !quote && <button type="button" onClick={async () => { setMenu(false); await markUnpaid(); }}><Icon name="x" />{tx("Mark as unpaid")}</button>}
                {inv.status !== "paid" && !quote && <button type="button" onClick={async () => { setMenu(false); await flush(); await invoiceAction({ ...inv, amount: t.total }, "markpaid"); onClose(); }}><Icon name="check" />{tx("Mark as paid")}</button>}
                {inv.status === "draft" && <button type="button" onClick={() => { setMenu(false); update("invoices", id, { kind: quote ? "invoice" : "quote" }); toast(quote ? tx("Changed to an invoice") : tx("Changed to a quote")); }}><Icon name="file" />{quote ? tx("Change to an invoice") : tx("Change to a quote")}</button>}
                {inv.status === "sent" && !quote && <button type="button" onClick={async () => { setMenu(false); await flush(); invoiceAction(inv, "nudge", { copy_me: copyMe }); }}><Icon name="send" />{tx("Send a nudge")}</button>}
                {inv.status !== "paid" && inv.status !== "cancelled" && <button type="button" onClick={async () => { setMenu(false); await flush(); await invoiceAction(inv, "cancel"); onClose(); }}><Icon name="x" />{quote ? tx("Withdraw quote") : tx("Cancel invoice")}</button>}
                {inv.status === "draft" && <button type="button" onClick={async () => { setMenu(false); if (!window.confirm(quote ? tx("Delete this draft quote?") : tx("Delete this draft invoice?"))) return; await remove("invoices", id); toast(tx("Draft deleted")); onClose(); }}><Icon name="x" />{tx("Delete draft")}</button>}
              </div>
            )}
          </div>
          <button type="button" className="btn btn-secondary btn-sm" aria-pressed={preview} onClick={() => setPreview(!preview)}><Icon name="eye" />{preview ? tx("Edit") : tx("Preview")}</button>
          {inv.status === "draft" ? <>
            <label className="check copyme" title={tx("Get a copy of this email in your inbox")}><input type="checkbox" checked={copyMe} onChange={(e) => setCopyMe(e.target.checked)} />{tx("Send me a copy")}</label>
            <button type="button" className="btn btn-primary btn-sm" onClick={send}><Icon name="send" />{quote ? tx("Send quote") : tx("Send invoice")}</button></>
            : inv.status === "sent" && !quote ? <button type="button" className="btn btn-primary btn-sm" onClick={async () => { await flush(); setPaying(true); }}><Icon name="wallet" />{tx("Record a payment")}</button>
            : inv.status === "paid" && !quote ? <><span className="sub" style={{ fontSize: 13 }}>{tx("Paid {fdate}", { fdate: fdate(inv.paid_at) })}</span><button type="button" className="btn btn-ghost btn-sm" onClick={markUnpaid}>{tx("Mark as unpaid")}</button></>
            : <span className="sub" style={{ fontSize: 13 }}>{inv.status === "paid" ? tx("Paid {fdate}", { fdate: fdate(inv.paid_at) }) : quote && inv.status === "sent" ? (inv.viewed_at ? tx("Viewed, waiting for a yes") : tx("Waiting for {name}", { name: c.name.split(" ")[0] })) : tx("Sent")}</span>}
        </header>

        <div className="sheet-body">
          {preview ? <div className="inv-col"><Preview d={d} t={t} inv={inv} /></div> : (
            <div className="inv-col">
              <section className="inv-sec">
                <h2 className="h-m">{tx("Bill to")}</h2>
                <div className="inv-bill">
                  <Avatar name={c.name} />
                  <div style={{ flex: 1, minWidth: 0 }}><b>{c.name}</b><div className="sub" style={{ fontSize: 13 }}>{[c.email, c.phone].filter(Boolean).join(" · ") || tx("No contact details yet")}</div></div>
                </div>
                <div className="form-grid">
                  <Field label={tx("Client")} id="ie-client"><select id="ie-client" value={d.client_id} onChange={(e) => setD((x) => ({ ...x, client_id: e.target.value, project_id: "" }))}>{clients.map((cl) => <option key={cl.id} value={cl.id}>{cl.name}</option>)}</select></Field>
                  <Field label={tx("Project")} id="ie-project"><select id="ie-project" value={d.project_id} onChange={(e) => set("project_id", e.target.value)}><option value="">{tx("No project")}</option>{clientProjects.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}</select></Field>
                </div>
                <Field label={quote ? tx("Quote title") : tx("Invoice title")} id="ie-label" help={tx("Shown to your client, e.g. \"Wedding balance\". Leave blank to use the first item.")}><input id="ie-label" value={d.label} onChange={(e) => set("label", e.target.value)} placeholder={tx("e.g. Deposit (50%)")} /></Field>
              </section>

              <section className="inv-sec">
                <div className="set-head"><h2 className="h-m">{tx("Items")}</h2>
                  {packages.length > 0 && <select className="inv-pkg" value="" onChange={(e) => addPackage(e.target.value)} aria-label={tx("Add from a package")}><option value="">{tx("+ Add from a package")}</option>{packages.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>}</div>
                <div className="inv-items-head" aria-hidden="true"><span>{tx("Item")}</span><span>{tx("Qty")}</span><span>{tx("Price")}</span><span className="right">{tx("Amount")}</span></div>
                {d.items.map((it, ix) => (
                  <div className="inv-item" key={it.id}>
                    <div className="inv-item-main">
                      <input className="inv-name" value={it.name} onChange={(e) => setItem(it.id, "name", e.target.value)} placeholder={tx("Heading, e.g. Amber Portrait Package")} aria-label={tx("Item name")} />
                      <textarea className="inv-desc" value={it.description} onChange={(e) => setItem(it.id, "description", e.target.value)}
                        onKeyDown={(e) => {
                          // Enter starts the next "- " line, like a list
                          if (e.key !== "Enter" || e.shiftKey) return;
                          const t = e.currentTarget, v = t.value, a = t.selectionStart;
                          const line = v.slice(v.lastIndexOf("\n", a - 1) + 1, a);
                          if (!/^\s*[-•]\s/.test(line) && v.trim()) return;
                          e.preventDefault();
                          if (/^\s*[-•]\s*$/.test(line)) { const st = a - line.length; setItem(it.id, "description", v.slice(0, st) + v.slice(a)); return; }
                          const ins = (v.trim() ? "\n" : "") + "- ";
                          // insertText keeps the cursor in the right place and fires the normal change
                          if (!document.execCommand?.("insertText", false, ins)) setItem(it.id, "description", v.slice(0, a) + ins + v.slice(t.selectionEnd));
                        }}
                        onFocus={(e) => { if (!it.description) setItem(it.id, "description", "- "); }}
                        onBlur={() => { if (/^\s*-\s*$/.test(it.description)) setItem(it.id, "description", ""); }}
                        placeholder={tx("- Lead photographer\n- 1 hour, 1 look\n- 5 retouched photos")} aria-label={tx("Item description")} rows={Math.min(12, Math.max(2, it.description.split("\n").length + 1))} />
                    </div>
                    <input className="inv-num" type="number" min="0" step="1" value={it.qty} onChange={(e) => setItem(it.id, "qty", e.target.value)} aria-label={tx("Quantity")} />
                    <label className="inv-price"><span>{SYM[d.currency] || ""}</span><MoneyInput value={it.price} onChange={(v) => setItem(it.id, "price", v)} aria-label={tx("Price")} /></label>
                    <div className="inv-amt"><b className="num">{money(n(it.qty) * n(it.price), d.currency)}</b>
                      <div className="inv-tools">
                        <button type="button" onClick={() => moveItem(it.id, -1)} disabled={ix === 0} aria-label={tx("Move up")}>↑</button>
                        <button type="button" onClick={() => moveItem(it.id, 1)} disabled={ix === d.items.length - 1} aria-label={tx("Move down")}>↓</button>
                        <button type="button" onClick={() => setD((x) => ({ ...x, items: x.items.filter((y) => y.id !== it.id) }))} disabled={d.items.length === 1} aria-label={tx("Remove item")}><Icon name="x" /></button>
                      </div>
                    </div>
                  </div>
                ))}
                <button type="button" className="btn btn-ghost btn-sm" style={{ alignSelf: "flex-start" }} onClick={() => setD((x) => ({ ...x, items: [...x.items, { id: uid(), name: "", description: "", qty: 1, price: 0 }] }))}><Icon name="plus" />{tx("Add item")}</button>
                <div className="inv-totals">
                  <div><span>{tx("Subtotal")}</span><b className="num">{money(t.subtotal, d.currency)}</b></div>
                  <div><span>{tx("Discount")}</span>
                    <span className="inv-inline"><MoneyInput value={d.discount} onChange={(v) => set("discount", v)} aria-label={tx("Discount")} />
                      <select value={d.discount_type} onChange={(e) => set("discount_type", e.target.value)} aria-label={tx("Discount type")}><option value="amount">{SYM[d.currency]}</option><option value="percent">%</option></select></span>
                    <b className="num">− {money(t.discount, d.currency)}</b></div>
                  <div><span>{tx("Tax")}</span><span className="inv-inline"><input type="number" min="0" step="0.1" value={d.tax_rate} onChange={(e) => set("tax_rate", e.target.value)} aria-label={tx("Tax rate")} /><em>%</em></span><b className="num">{money(t.tax, d.currency)}</b></div>
                  <div className="inv-total"><span>{tx("Total")}</span><b className="num">{money(t.total, d.currency)}</b></div>
                </div>
              </section>

              {!quote && inv.status !== "cancelled" && (
                <section className="inv-sec">
                  <div className="set-head"><h2 className="h-m">{tx("Payments received")}</h2>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {canPay && <button type="button" className="btn btn-secondary btn-sm" onClick={async () => { await flush(); setPaying(true); }}><Icon name="plus" />{tx("Record a part payment")}</button>}
                      {inv.status === "paid" && <button type="button" className="btn btn-ghost btn-sm" onClick={markUnpaid}><Icon name="x" />{tx("Mark as unpaid")}</button>}
                    </div></div>
                  {payments.length ? payments.map((pm, ix) => (
                    <div className="switch" key={pm.id || ix}><div><b className="num">{money(pm.amount, d.currency)}</b><span>{fdate(pm.date)} · {tx(pm.method || "")}{pm.note ? " · " + pm.note : ""}</span></div>
                      <button type="button" className="icon-btn" onClick={() => removePayment(pm)} aria-label={tx("Remove this payment")} title={tx("Remove this payment")}><Icon name="x" /></button></div>
                  )) : <p className="sub" style={{ fontSize: 13 }}>{inv.status === "paid" ? tx("Marked as paid in full. No part payments were recorded.") : tx("No payments yet. When your client pays a deposit or part of it, record it here and the balance updates on their invoice.")}</p>}
                  <div className="inv-totals"><div className="inv-total"><span>{inv.status === "paid" ? tx("Paid in full") : tx("Balance due")}</span><b className="num">{money(inv.status === "paid" ? 0 : owed, d.currency)}</b></div></div>
                </section>
              )}

              <section className="inv-sec">
                <h2 className="h-m">{tx("Notes")}</h2>
                <textarea className="inv-notes" value={d.notes} onChange={(e) => set("notes", e.target.value)} placeholder={tx("Anything your client should know: what's not included, how long you keep the images, studio fees…")} aria-label={tx("Notes")} rows={5} />
              </section>

              <section className="inv-sec">
                <h2 className="h-m">{quote ? tx("Valid until") : tx("Due date")}</h2>
                <div className="form-grid">
                  <Field label={tx("Final payment due")} id="ie-due" help={daysFrom(d.due_date) >= 0 ? tx("In {n} days", { n: daysFrom(d.due_date) }) : tx("{n} days ago", { n: -daysFrom(d.due_date) })}><input id="ie-due" type="date" value={d.due_date} onChange={(e) => set("due_date", e.target.value)} /></Field>
                  <div className="field"><label>{tx("Quick pick")}</label><div className="chips">{[[0, "On receipt"], [7, "7 days"], [14, "14 days"], [30, "30 days"]].map(([k, l]) => <button key={k} type="button" className="chip" aria-pressed={d.due_date === addDays(k)} onClick={() => set("due_date", addDays(k))}>{tx(l)}</button>)}</div></div>
                </div>
                <div className="switch"><div><b>{tx("Payment schedule")}</b><span>{tx("Take a deposit now and the balance later, or split into instalments.")}</span></div>
                  <Toggle on={d.schedule.length > 0} label={tx("Payment schedule")} onChange={(v) => set("schedule", v ? [{ id: uid(), percent: 50, due: isoDay(new Date()) }, { id: uid(), percent: 50, due: d.due_date }] : [])} /></div>
                {rows.length > 0 && (
                  <div className="inv-sched">
                    <div className="inv-sched-head" aria-hidden="true"><span>{tx("Payment")}</span><span>{tx("Share")}</span><span>{tx("Amount")}</span><span>{tx("Due")}</span><span /></div>
                    {rows.map((r, i) => {
                      const last = i === rows.length - 1;
                      return (
                        <div className="inv-sched-row" key={r.id || i}>
                          <span>{tx("{a} of {b}", { a: i + 1, b: rows.length })}</span>
                          {last ? <span className="sub">{r.percent}%</span> : <label className="inv-inline"><input type="number" min="0" max="100" value={d.schedule[i].percent} onChange={(e) => set("schedule", d.schedule.map((x, j) => (j === i ? { ...x, percent: e.target.value } : x)))} aria-label={tx("Percent for payment {a}", { a: i + 1 })} /><em>%</em></label>}
                          <b className="num">{money(r.amount, d.currency)}</b>
                          <input type="date" value={(last ? d.due_date : d.schedule[i].due) || ""} disabled={last} onChange={(e) => set("schedule", d.schedule.map((x, j) => (j === i ? { ...x, due: e.target.value } : x)))} aria-label={tx("Due date for payment {a}", { a: i + 1 })} />
                          {rows.length > 2 && !last ? <button type="button" className="x" onClick={() => set("schedule", d.schedule.filter((_, j) => j !== i))} aria-label={tx("Remove payment")}><Icon name="x" /></button> : <span />}
                        </div>
                      );
                    })}
                    <button type="button" className="btn btn-ghost btn-sm" style={{ alignSelf: "flex-start" }} onClick={() => set("schedule", [...d.schedule.slice(0, -1), { id: uid(), percent: 25, due: addDays(14) }, d.schedule[d.schedule.length - 1]])}><Icon name="plus" />{tx("Add another payment")}</button>
                    <span className="help sub" style={{ fontSize: 12 }}>{tx("The last payment is always the balance, due on the final due date.")}</span>
                  </div>
                )}
              </section>

              <section className="inv-sec">
                <h2 className="h-m">{tx("Advanced options")}</h2>
                <div className="field"><label>{tx("Accepted payment methods")}</label>
                  <div className="chips">{(enabled.length ? enabled : METHODS.slice(0, 1)).map(([k, l]) => <label key={k} className="check"><input type="checkbox" checked={d.methods.includes(k)} onChange={(e) => set("methods", e.target.checked ? [...d.methods, k] : d.methods.filter((m) => m !== k))} />{tx(l)}</label>)}</div>
                  <span className="help">{tx("Turn methods on or off for your whole studio in Settings › Payments.")}</span></div>
                <Field label={tx("Currency")} id="ie-cur"><select id="ie-cur" value={d.currency} onChange={(e) => set("currency", e.target.value)}>{CURRENCIES.map((cc) => <option key={cc} value={cc}>{cc} ({SYM[cc]})</option>)}</select></Field>
                <div className="switch"><div><b>{tx("Payment reminders")}</b><span>{studio.reminders_on ? tx("Friendly reminders for each payment due.") : tx("Reminders are off for your studio. Turn them on in Settings › Reminders.")}</span></div>
                  <Toggle on={d.reminders_on && studio.reminders_on} label={tx("Payment reminders")} onChange={(v) => set("reminders_on", v)} /></div>
                {d.reminders_on && studio.reminders_on && (
                  <div className="chips">{REMIND.map(([k, l]) => <label key={k} className="check"><input type="checkbox" checked={d.reminder_days.includes(k)} onChange={(e) => set("reminder_days", e.target.checked ? [...d.reminder_days, k].sort((a, b) => a - b) : d.reminder_days.filter((x) => x !== k))} />{tx(l)}</label>)}</div>
                )}
                <div className="switch"><div><b>{tx("Allow tip")}</b><span>{tx("Let clients add a tip when they pay.")}</span></div><Toggle on={d.allow_tip} label={tx("Allow tip")} onChange={(v) => set("allow_tip", v)} /></div>
              </section>
            </div>
          )}
        </div>
      </div>
      {paying && <RecordPayment inv={inv} total={t.total} onClose={() => setPaying(false)} />}
    </div>
  );
}
