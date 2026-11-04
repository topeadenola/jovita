// What a client sees at /i/<link>: one invoice or quote, how to pay it (the studio's bank account), and a PDF download.
// No sign-in. Opened from the invoice email, on the studio's own address.
import { Fragment, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "../supabase";
import { tx } from "../lib/i18n";
import { fdate, money, portalUrl } from "../lib/format";
import { bankText } from "../lib/payments";
import { invoicePdf } from "../lib/invoicePdf";
import { METHODS, schedRows, totals } from "../components/InvoiceEditor";
import { logoUrl } from "../components/StudioLogo";
import { useToast } from "../components/ui";
import { counts, isChoice, isOptional, layout, picUrl } from "../lib/items";
import Icon, { Mark } from "../components/Icon";

const n = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const clean = (s) => String(s || "").split("\n").filter((l) => !/^\s*[-•]\s*$/.test(l)).join("\n").trim();

export default function InvoiceView() {
  const { token } = useParams();
  const toast = useToast();
  const [v, setV] = useState(undefined);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    supabase.rpc("invoice_view", { p_token: token }).then(({ data }) => setV(data || null), () => setV(null));
  }, [token]);
  const calc = useMemo(() => {
    if (!v) return null;
    const i = v.invoice;
    const d = { ...i, items: Array.isArray(i.items) && i.items.length ? i.items : [{ name: i.label, qty: 1, price: i.amount }], schedule: Array.isArray(i.schedule) ? i.schedule : [] };
    const t = totals(d);
    return { d, t, rows: d.schedule.length > 1 ? schedRows(d, t) : [] };
  }, [v]);

  if (v === undefined) return <div className="loading">{tx("Loading…")}</div>;
  if (!v) return (
    <main className="site-card-wrap"><div className="site-card"><h1 className="h-l">{tx("This invoice isn't available")}</h1><p className="sub">{tx("Check the link with the person who sent it.")}</p></div></main>
  );
  const { invoice: i, studio: s, client: c, project: p } = v;
  const { d, t, rows } = calc;
  const lay = layout(d.items);
  const quote = i.kind === "quote";
  const paid = i.status === "paid";
  const balance = Math.max(0, n(i.amount) - n(i.amount_paid));
  const methods = (i.methods || []).map((m) => tx((METHODS.find((x) => x[0] === m) || [m, m])[1]));
  const bank = (!(i.methods || []).length || i.methods.includes("transfer")) ? ((v.banks || []).map(bankText).filter(Boolean).join("\n\n") || String(s.bank_details || "").trim()) : "";
  const payLink = p?.portal_token ? portalUrl(p.portal_token) : "";
  const acct = (v.banks || []).find((b) => b.account_number)?.account_number;
  const download = async () => {
    setBusy(true);
    try {
      await invoicePdf({ ...d, ...t, number: i.number, kind: i.kind, status: i.status, created_at: i.created_at, paid_at: i.paid_at, amount_paid: i.amount_paid,
        schedule: rows, client: c, project: p, studio: { name: s.name, email: s.email }, logoUrl: s.logo_path ? logoUrl(s.logo_path) : "",
        brand: s.plan === "free", methods, bank, payLink: payLink || location.href });
    } catch (e) { toast(tx("That didn't work: {err}", { err: e.message })); }
    setBusy(false);
  };
  return (
    <main className="iv-wrap">
      <div className="iv">
        <div className="doc inv-doc">
          <div className="doc-head">
            {s.logo_path ? <img src={logoUrl(s.logo_path)} alt="" className="iv-logo" /> : null}
            <div style={{ flex: 1 }}><b>{s.name}</b><br /><span className="sub" style={{ fontSize: 13 }}>{quote ? tx("Quote #{number}", { number: i.number }) : tx("Invoice #{number}", { number: i.number })}</span></div>
            <div style={{ textAlign: "right" }}><span className="sub" style={{ fontSize: 12 }}>{paid ? tx("Paid") : quote ? tx("Valid until") : tx("Due")}</span><br /><b>{fdate(paid ? i.paid_at : i.due_date)}</b></div>
          </div>
          <div><span className="sub" style={{ fontSize: 12 }}>{tx("Bill to")}</span><br /><b>{c.name}</b>{p?.title ? <><br /><span className="sub" style={{ fontSize: 13 }}>{p.title}</span></> : null}</div>
          {lay.top.map((p) => <img key={p.id} className="doc-pic" src={picUrl(p.path)} alt="" />)}
          <table className="doc-table"><tbody>
            {lay.lines.filter(({ it }) => quote || counts(it)).map(({ it, head }, k) => (<Fragment key={it.id || k}>
              {quote && head && <tr className="doc-kind"><td colSpan={3}>{head === "choice" ? tx("Choose one") : tx("Optional extra")}</td></tr>}
              <tr className={quote && (isChoice(it) || isOptional(it)) && !it.selected ? "doc-off" : undefined}><td><b>{quote && (isChoice(it) || isOptional(it)) && <span className="doc-mark">{isChoice(it) ? (it.selected ? "◉ " : "○ ") : it.selected ? "☑ " : "☐ "}</span>}{it.name || tx("Item")}</b>{clean(it.description) && <div className="sub" style={{ fontSize: 12, whiteSpace: "pre-line" }}>{clean(it.description)}</div>}</td>
                <td className="right" style={{ whiteSpace: "nowrap" }}>{n(it.qty)} × {money(it.price, i.currency)}</td><td className="right"><b>{money(n(it.qty) * n(it.price), i.currency)}</b></td></tr>
            </Fragment>))}
            <tr><td colSpan={2} className="right">{tx("Subtotal")}</td><td className="right">{money(t.subtotal, i.currency)}</td></tr>
            {t.discount > 0 && <tr><td colSpan={2} className="right">{tx("Discount")}</td><td className="right">− {money(t.discount, i.currency)}</td></tr>}
            {t.tax > 0 && <tr><td colSpan={2} className="right">{tx("Tax ({rate}%)", { rate: i.tax_rate })}</td><td className="right">{money(t.tax, i.currency)}</td></tr>}
            <tr><td colSpan={2} className="right"><b>{tx("Total")}</b></td><td className="right"><b style={{ fontSize: 18 }}>{money(t.total, i.currency)}</b></td></tr>
            {n(i.amount_paid) > 0 && !paid && <>
              <tr><td colSpan={2} className="right">{tx("Paid so far")}</td><td className="right">− {money(i.amount_paid, i.currency)}</td></tr>
              <tr><td colSpan={2} className="right"><b>{tx("Balance due")}</b></td><td className="right"><b>{money(balance, i.currency)}</b></td></tr></>}
          </tbody></table>
          {lay.bottom.map((p) => <img key={p.id} className="doc-pic" src={picUrl(p.path)} alt="" />)}
          {quote && d.items.some((it) => isChoice(it) || isOptional(it)) && <p className="sub" style={{ fontSize: 13 }}>{tx("This quote has options. You choose them when you accept it.")}</p>}
          {rows.length > 1 && <div><b style={{ fontSize: 13 }}>{tx("Payment schedule")}</b>
            {rows.map((r, k) => <div key={k} className="doc-sign" style={{ borderTop: 0, paddingTop: 4 }}><span>{tx("Payment {a} of {b}", { a: k + 1, b: rows.length })} · {r.due ? fdate(r.due) : tx("On receipt")}</span><b>{money(r.amount, i.currency)}</b></div>)}</div>}
          {i.notes && <div className="doc-text" style={{ fontSize: 13 }}>{i.notes}</div>}
        </div>

        <aside className="iv-side">
          {paid ? (
            <section className="card iv-paid"><Icon name="check" /><div><b>{tx("Paid. Thank you!")}</b><p className="sub">{tx("{studio} has your payment.", { studio: s.name })}</p></div></section>
          ) : (
            <section className="card iv-pay">
              <h2 className="h-m">{quote ? tx("How to pay once you accept") : tx("How to pay")}</h2>
              {!quote && <p className="iv-amt"><span className="sub">{n(i.amount_paid) > 0 ? tx("Balance due") : tx("Amount due")}</span><b className="num">{money(balance, i.currency)}</b></p>}
              {bank && <div className="iv-bank"><span className="sub" style={{ fontSize: 13 }}>{tx("Bank transfer")}</span><pre>{bank}</pre>
                {acct && <button type="button" className="btn btn-secondary btn-sm" onClick={async () => { try { await navigator.clipboard.writeText(acct); toast(tx("Account number copied"), true); } catch { /* shown above */ } }}><Icon name="link" />{tx("Copy account number")}</button>}</div>}
              {payLink && <a className="btn btn-primary" href={payLink}>{quote ? tx("See quote and accept") : tx("Pay online or tell {name} you've paid", { name: s.name })}</a>}
              {!bank && !payLink && <p className="sub">{tx("{studio} will tell you how to pay. Reply to their email if you have questions.", { studio: s.name })}</p>}
              {methods.length > 0 && <p className="sub" style={{ fontSize: 13 }}>{tx("Pay by")}: {methods.join(", ")}</p>}
            </section>
          )}
          <button type="button" className="btn btn-secondary" disabled={busy} onClick={download}><Icon name="file" />{busy ? tx("Preparing…") : tx("Download PDF")}</button>
          {s.plan === "free" && <a className="site-made" href="https://getjovita.com" target="_blank" rel="noreferrer"><Mark dot="#261433" style={{ width: 10, height: 14 }} />{tx("Made with Jovita")}</a>}
        </aside>
      </div>
    </main>
  );
}
