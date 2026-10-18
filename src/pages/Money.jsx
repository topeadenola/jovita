import { useState } from "react";
import { Link } from "react-router-dom";
import { useData } from "../lib/data";
import { useActions } from "../lib/actions";
import { useUi } from "../components/Shell";
import Icon from "../components/Icon";
import { Avatar, Empty, Pill, Toggle, useToast } from "../components/ui";
import { balanceOf, fdate, invState, money, totalLine, totalsBy } from "../lib/format";
import { tx } from "../lib/i18n";
import { receipts } from "../lib/accounting";

const TABS = ["All", "Overdue", "Due soon", "Part paid", "Check payment", "Sent", "Paid", "Draft", "Quotes"];
const inTab = (i, tab) => tab === "All" || (tab === "Quotes" ? i.kind === "quote" : i.kind !== "quote" && (invState(i).k === tab || (tab === "Sent" && invState(i).k === "Viewed") || (tab === "Draft" && i.status === "draft")));

export default function Money() {
  const { invoices, studio, client, project, updateStudio } = useData();
  const { invoiceAction } = useActions();
  const { q, open, setOpenInvoice } = useUi();
  const toast = useToast();
  const [tab, setTab] = useState("All");
  const home = studio.home_currency;
  const ql = q.toLowerCase();
  const list = invoices
    .filter((i) => inTab(i, tab))
    .filter((i) => !ql || (client(i.client_id).name + " " + i.number + " " + i.label).toLowerCase().includes(ql))
    .sort((a, b) => b.number - a.number);
  const paid = totalLine(totalsBy(invoices.flatMap(receipts)), home); // includes part payments
  const owing = invoices.filter((i) => i.status === "sent" && i.kind !== "quote").map((i) => ({ ...i, amount: balanceOf(i) }));
  const upcoming = totalLine(totalsBy(owing.filter((i) => invState(i).k !== "Overdue")), home);
  const late = totalLine(totalsBy(owing.filter((i) => invState(i).k === "Overdue")), home);
  const setS = async (k, v, label) => { try { await updateStudio({ [k]: v }); toast(v ? tx("{label} on", { label }) : tx("{label} off", { label })); } catch (e) { toast(e.message); } };

  return (
    <>
      <div className="head"><div><p className="eyebrow">{tx("Money")}</p><h1 className="h-l">{tx("Invoices and payments")}</h1></div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}><button className="btn btn-secondary" onClick={() => open("quote")}><Icon name="file" />{tx("New quote")}</button>
          <button className="btn btn-primary" onClick={() => open("invoice")}><Icon name="plus" />{tx("New invoice")}</button></div></div>
      <div className="grid g-4">
        <div className="card stat"><p className="label" style={{ color: "var(--success)" }}>{tx("● Paid")}</p><p className="val num">{paid.main}</p><p className="note">{paid.others}</p></div>
        <div className="card stat"><p className="label" style={{ color: "var(--info)" }}>{tx("● Upcoming")}</p><p className="val num">{upcoming.main}</p><p className="note">{upcoming.others}</p></div>
        <div className="card stat"><p className="label" style={{ color: "var(--danger)" }}>{tx("● Overdue")}</p><p className="val num">{late.main}</p><p className="note">{late.others}</p></div>
      </div>
      <div className="card" style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", background: "var(--lilac)", borderColor: "var(--lilac)" }}>
        <span className="dot d-joy"><Icon name="clock" /></span>
        <div style={{ flex: 1, minWidth: 220 }}><b>{studio.reminders_on ? tx("Automatic reminders are on") : tx("Automatic reminders are off")}</b>
          <p style={{ fontSize: 13 }}>{studio.reminders_on ? tx(
            "Clients get a friendly email before and after an invoice is due."
          ) : tx("Turn them on so you never have to chase.")}</p></div>
        <Toggle on={studio.reminders_on} label={tx("Automatic reminders")} onChange={(v) => setS("reminders_on", v, tx("Automatic reminders"))} />
      </div>
      {!invoices.length ? <Empty icon="receipt" title={tx("No invoices yet")} text={tx("Create one from a template, or from any project.")} action={<button className="btn btn-primary" onClick={() => open("invoice")}>{tx("New invoice")}</button>} /> : (
        <>
          <div className="tabs" role="tablist">{TABS.map((t) => <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}>{tx(t)}</button>)}</div>
          <div className="tablewrap"><table><thead><tr><th>{tx("Invoice")}</th><th>{tx("Client")}</th><th>{tx("Status")}</th><th>{tx("Due")}</th><th>{tx("Reminders")}</th><th className="right">{tx("Amount")}</th><th /></tr></thead><tbody>
            {list.map((i) => {
              const st = invState(i); const c = client(i.client_id); const p = i.project_id && project(i.project_id);
              return (
                <tr key={i.id} className="click" onClick={(e) => { if (!e.target.closest("button,a,input,label")) setOpenInvoice(i.id); }}>
                  <td><button type="button" className="linklike" onClick={() => setOpenInvoice(i.id)}><b className="num">{i.kind === "quote" ? tx("Quote") + " " : ""}#{i.number}</b></button><small style={{ display: "block", color: "var(--muted)", fontSize: 12 }}>{i.label}</small>{i.payment_reported_at && i.status === "sent" && <small style={{ display: "block", color: "var(--info, #2B54C4)", fontSize: 12, fontWeight: 600 }}>{i.payment_method ? tx("Client paid by {how} · ref {ref}. Check your {how} account, then mark paid.", { how: i.payment_method === "paystack" ? "Paystack" : i.payment_method === "flutterwave" ? "Flutterwave" : i.payment_method === "paypal" ? "PayPal" : i.payment_method, ref: i.payment_reference || "—" }) : tx("Client says they've paid by transfer. Check your bank, then mark paid.")}</small>}</td>
                  <td><div className="who"><Avatar name={c.name} /><div><b>{c.name}</b><small>{p ? p.title : ""}</small></div></div></td>
                  <td><Pill c={st.c}>{st.viewed && <Icon name="eye" />}{tx(st.k)}{st.late ? ` · ${tx("{n}d", { n: st.late })}` : ""}</Pill>{i.viewed_at && i.status === "sent" && <small style={{ display: "block", color: "var(--muted)", fontSize: 12 }}>{tx("Opened {date}", { date: fdate(i.viewed_at) })}</small>}</td>
                  <td>{i.status === "paid" ? tx("Paid {fdate}", {
                    fdate: fdate(i.paid_at)
                  }) : fdate(i.due_date)}</td>
                  <td>{i.status === "sent" || i.status === "draft" ? (
                    <span className="rem-cell"><Toggle on={(i.reminders_on ?? true) && studio.reminders_on} label={tx("Reminders for invoice #{number}", { number: i.number })} onChange={() => (studio.reminders_on ? invoiceAction(i, "reminders") : toast(tx("Turn on automatic reminders above first.")))} />
                      {studio.reminders_on && (i.reminders_on ?? true) ? tx("On") : tx("Off")}</span>) : <span className="sub">—</span>}</td>
                  <td className="right num"><b>{money(i.amount, i.currency)}</b>{Number(i.amount_paid) > 0 && i.status === "sent" && <small style={{ display: "block", color: "var(--muted)", fontSize: 12 }}>{tx("{amount} left", { amount: money(balanceOf(i), i.currency) })}</small>}</td>
                  <td className="right" style={{ whiteSpace: "nowrap" }}>
                    {i.status === "draft" && <button className="btn btn-primary btn-sm" onClick={() => invoiceAction(i, "send")}><Icon name="send" />{tx("Send")}</button>}
                    {i.status === "sent" && i.kind === "quote" && <span className="sub" style={{ fontSize: 13 }}>{tx("Waiting for a yes")}</span>}
                    {i.status === "sent" && i.kind !== "quote" && <>{st.k !== "Sent" && <button className="btn btn-secondary btn-sm" onClick={() => invoiceAction(i, "nudge")}>{tx("Nudge")}</button>}{" "}
                      <button className="btn btn-ghost btn-sm" onClick={() => invoiceAction(i, "markpaid")}><Icon name="check" />{tx("Mark paid")}</button></>}
                    {i.status === "paid" && <span className="sub" style={{ fontSize: 13 }}>{tx("Paid")}</span>}
                  </td>
                </tr>
              );
            })}
            {!list.length && <tr><td colSpan={7} className="sub">{tx("No invoices here.")}</td></tr>}
          </tbody></table></div>
        </>
      )}
      <p className="sub" style={{ fontSize: 13 }}>{tx("Payment methods and reminder rules live in")}{" "}<Link to="/settings?tab=payments">{tx("Settings › Payments")}</Link>.</p>
    </>
  );
}
