import { useMemo, useState } from "react";
import { useData } from "../lib/data";
import Icon from "../components/Icon";
import { CloseBtn, Empty, Modal, Pill, useToast } from "../components/ui";
import { txn } from "../lib/i18n";
import { CURRENCIES, SYM, fdate, money, todayISO } from "../lib/format";
import {
  EXPENSE_CATEGORIES, PERIODS, SUBSCRIPTION_PRESETS, lastMonths, monthly, nextRenewalAfter,
  renewsIn, summary, toCSV, usedCurrencies,
} from "../lib/accounting";
import { tx } from "../lib/i18n";

const INCOME = "#E89A00", SPENT = "#7A4FD6";

/* ---------- Forms ---------- */
function Sheet({ title, onClose, onSubmit, submitLabel, children }) {
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  return (
    <Modal label={title} onClose={onClose}>
      <form style={{ display: "flex", flexDirection: "column", gap: 16 }} onSubmit={async (e) => {
        e.preventDefault(); setErr(""); setBusy(true);
        try { await onSubmit(); } catch (x) { setErr(x.message); } finally { setBusy(false); }
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><h2 className="h-l">{title}</h2><CloseBtn onClick={onClose} /></div>
        {children}
        {err && <p className="err" role="alert">{err}</p>}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <button type="button" className="btn btn-ghost" data-dismiss onClick={onClose}>{tx("Cancel")}</button>
          <button className="btn btn-primary" disabled={busy}>{busy ? tx("Saving…") : submitLabel}</button>
        </div>
      </form>
    </Modal>
  );
}

function ExpenseForm({ onClose, cur }) {
  const { insert, projects } = useData();
  const toast = useToast();
  const [f, setF] = useState({ vendor: "", category: "Equipment", amount: "", currency: cur, spent_on: todayISO(), note: "", project_id: "" });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <Sheet title={tx("Add an expense")} submitLabel={tx("Save expense")} onClose={onClose} onSubmit={async () => {
      if (!f.vendor.trim()) throw new Error(tx("Who did you pay? e.g. Jumia, B&H, Uber."));
      if (!(Number(f.amount) > 0)) throw new Error(tx("Add an amount above zero."));
      await insert("expenses", { ...f, vendor: f.vendor.trim(), amount: Number(f.amount), project_id: f.project_id || null });
      toast(tx("Expense saved")); onClose();
    }}>
      <div className="form-grid">
        <div className="field"><label htmlFor="x-vendor">{tx("Paid to")}</label><input id="x-vendor" autoFocus value={f.vendor} onChange={set("vendor")} placeholder={tx("e.g. Jumia, B&H, Uber")} /></div>
        <div className="field"><label htmlFor="x-cat">{tx("Category")}</label><select id="x-cat" value={f.category} onChange={set("category")}>{EXPENSE_CATEGORIES.map((c) => <option key={c} value={c}>{tx(c)}</option>)}</select></div>
      </div>
      <div className="form-grid">
        <div className="field"><label htmlFor="x-amt">{tx("Amount")}</label><input id="x-amt" inputMode="decimal" value={f.amount} onChange={set("amount")} placeholder="0" /></div>
        <div className="field"><label htmlFor="x-cur">{tx("Currency")}</label><select id="x-cur" value={f.currency} onChange={set("currency")}>{CURRENCIES.map((c) => <option key={c} value={c}>{c} ({SYM[c]})</option>)}</select></div>
      </div>
      <div className="form-grid">
        <div className="field"><label htmlFor="x-date">{tx("Date")}</label><input id="x-date" type="date" value={f.spent_on} onChange={set("spent_on")} /></div>
        <div className="field"><label htmlFor="x-proj">{tx("For a project?")}</label><select id="x-proj" value={f.project_id} onChange={set("project_id")}><option value="">{tx("No, general business")}</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}</select></div>
      </div>
      <div className="field"><label htmlFor="x-note">{tx("Note")}</label><input id="x-note" value={f.note} onChange={set("note")} placeholder={tx("e.g. 50mm lens, Uber to the venue")} /></div>
    </Sheet>
  );
}

function SubscriptionForm({ onClose, cur, sub }) {
  const { insert, update } = useData();
  const toast = useToast();
  const [f, setF] = useState(sub ? { name: sub.name, amount: String(sub.amount), currency: sub.currency, cycle: sub.cycle, next_renewal: sub.next_renewal }
    : { name: "", amount: "", currency: cur === "NGN" ? "USD" : cur, cycle: "monthly", next_renewal: todayISO() });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <Sheet title={sub ? tx("Edit subscription") : tx("Add a subscription")} submitLabel={tx("Save")} onClose={onClose} onSubmit={async () => {
      if (!f.name.trim()) throw new Error(tx("Name the app, e.g. Adobe Creative Cloud."));
      const row = { ...f, name: f.name.trim(), amount: Number(f.amount) || 0 };
      if (sub) await update("subscriptions", sub.id, row); else await insert("subscriptions", row);
      toast(sub ? tx("Subscription updated") : tx("{name} added", {
        name: row.name
      })); onClose();
    }}>
      {!sub && <div className="chips" aria-label={tx("Popular tools")}>{SUBSCRIPTION_PRESETS.map((p) => (
        <button type="button" key={p} className="chip" aria-pressed={f.name === p} onClick={() => setF({ ...f, name: p })}>{p}</button>))}</div>}
      <div className="field"><label htmlFor="s-name">{tx("App or service")}</label><input id="s-name" value={f.name} onChange={set("name")} placeholder={tx("e.g. Evoto")} /></div>
      <div className="form-grid">
        <div className="field"><label htmlFor="s-amt">{tx("Price")}</label><input id="s-amt" inputMode="decimal" value={f.amount} onChange={set("amount")} placeholder={tx("What you pay each time")} /></div>
        <div className="field"><label htmlFor="s-cur">{tx("Currency")}</label><select id="s-cur" value={f.currency} onChange={set("currency")}>{CURRENCIES.map((c) => <option key={c} value={c}>{c} ({SYM[c]})</option>)}</select></div>
      </div>
      <div className="form-grid">
        <div className="field"><label htmlFor="s-cycle">{tx("Billed")}</label><select id="s-cycle" value={f.cycle} onChange={set("cycle")}><option value="monthly">{tx("Every month")}</option><option value="yearly">{tx("Every year")}</option></select></div>
        <div className="field"><label htmlFor="s-next">{tx("Next renewal")}</label><input id="s-next" type="date" value={f.next_renewal} onChange={set("next_renewal")} /></div>
      </div>
    </Sheet>
  );
}

/* ---------- Chart: income vs spending, last 6 months ---------- */
function MonthChart({ data, cur }) {
  const [hover, setHover] = useState(null);
  const [table, setTable] = useState(false);
  const W = 560, H = 260, pad = { l: 8, r: 8, t: 12, b: 24 };
  const max = Math.max(1, ...data.flatMap((d) => [d.income, d.spent]));
  const gw = (W - pad.l - pad.r) / data.length, bw = Math.min(18, gw / 4);
  const y = (v) => pad.t + (H - pad.t - pad.b) * (1 - v / max);
  const bar = (x, v, color) => {
    const top = y(v), h = H - pad.b - top;
    if (h <= 0) return null;
    const r = Math.min(4, h);
    return <path d={`M${x},${H - pad.b} V${top + r} Q${x},${top} ${x + r},${top} H${x + bw - r} Q${x + bw},${top} ${x + bw},${top + r} V${H - pad.b} Z`} fill={color} />;
  };
  return (
    <section className="card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <h2 className="h-m">{tx("Earned and spent, last 6 months")}</h2>
        <div style={{ display: "flex", gap: 14, alignItems: "center", fontSize: 13 }}>
          <span className="legend"><i style={{ background: INCOME }} />{tx("Earned")}</span>
          <span className="legend"><i style={{ background: SPENT }} />{tx("Spent")}</span>
          <button className="btn btn-ghost btn-sm" onClick={() => setTable(!table)}>{table ? tx("Show chart") : tx("Show table")}</button>
        </div>
      </div>
      {table ? (
        <div className="tablewrap" style={{ marginTop: 10 }}><table><thead><tr><th>{tx("Month")}</th><th className="right">{tx("Earned")}</th><th className="right">{tx("Spent")}</th><th className="right">{tx("Profit")}</th></tr></thead>
          <tbody>{data.map((d) => <tr key={d.label}><td>{d.label}</td><td className="right num">{money(d.income, cur)}</td><td className="right num">{money(d.spent, cur)}</td><td className="right num"><b>{money(d.income - d.spent, cur)}</b></td></tr>)}</tbody></table></div>
      ) : (
        <div style={{ position: "relative" }}>
          <svg className="chart" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={tx("Earned and spent per month in {cur}", {
            cur: cur
          })} style={{ height: 260 }}>
            {[0.5, 1].map((t) => <line key={t} x1={pad.l} x2={W - pad.r} y1={y(max * t)} y2={y(max * t)} stroke="var(--line)" strokeDasharray="3 4" />)}
            <line x1={pad.l} x2={W - pad.r} y1={H - pad.b} y2={H - pad.b} stroke="var(--line-strong)" />
            {data.map((d, i) => {
              const cx = pad.l + gw * i + gw / 2;
              return (
                <g key={d.label} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
                  <rect x={pad.l + gw * i} y={pad.t} width={gw} height={H - pad.t} fill={hover === i ? "var(--sunken)" : "transparent"} />
                  {bar(cx - bw - 1, d.income, INCOME)}
                  {bar(cx + 1, d.spent, SPENT)}
                  <text x={cx} y={H - 6} textAnchor="middle">{d.label}</text>
                </g>
              );
            })}
          </svg>
          {hover !== null && (
            <div className="tip" style={{ left: `${((hover + 0.5) / data.length) * 100}%` }}>
              <b>{data[hover].label}</b>
              <span><i style={{ background: INCOME }} />{tx("Earned")}{" "}{money(data[hover].income, cur)}</span>
              <span><i style={{ background: SPENT }} />{tx("Spent")}{" "}{money(data[hover].spent, cur)}</span>
              <span>{tx("Profit")}{" "}<b>{money(data[hover].income - data[hover].spent, cur)}</b></span>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

/* ---------- Page ---------- */
export default function Accounting() {
  const data = useData();
  const { invoices, expenses, subscriptions, studio, client, remove, update, insert } = data;
  const toast = useToast();
  const [period, setPeriod] = useState("month");
  const curs = usedCurrencies(data, studio.home_currency);
  const [cur, setCur] = useState(studio.home_currency);
  const [form, setForm] = useState(null); // {kind, sub}
  const s = useMemo(() => summary(data, period, cur), [data, period, cur]);
  const months = useMemo(() => lastMonths(data, cur), [data, cur]);
  const subs = subscriptions.filter((x) => x.active).sort((a, b) => (a.next_renewal < b.next_renewal ? -1 : 1));
  const periodLabel = tx(PERIODS.find((p) => p[0] === period)[1]).toLowerCase();
  const maxCat = Math.max(1, ...s.byCategory.map((c) => c[1]));

  const exportCSV = () => {
    const blob = new Blob([toCSV(s, (id) => client(id).name)], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `jovita-accounts-${cur}-${period}-${s.range[0]}.csv`;
    a.click(); URL.revokeObjectURL(a.href);
    toast(tx("Spreadsheet downloaded"));
  };
  const markRenewed = async (sub) => {
    try {
      await insert("expenses", { vendor: sub.name, category: "Software and subscriptions", amount: sub.amount, currency: sub.currency, spent_on: sub.next_renewal > todayISO() ? todayISO() : sub.next_renewal, note: sub.cycle === "yearly" ? tx("Yearly subscription") : tx("Monthly subscription"), subscription_id: sub.id });
      await update("subscriptions", sub.id, { next_renewal: nextRenewalAfter(sub) });
      toast(tx("{name} payment logged", {
        name: sub.name
      }));
    } catch (e) { toast(e.message); }
  };

  return (
    <>
      <div className="head"><div><p className="eyebrow">{tx("Accounting")}</p><h1 className="h-l">{tx("What you made and spent")}</h1></div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button className="btn btn-secondary" onClick={exportCSV}><Icon name="file" />{tx("Export for accountant")}</button>
          <button className="btn btn-primary" onClick={() => setForm({ kind: "expense" })}><Icon name="plus" />{tx("Add expense")}</button>
        </div></div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <div className="seg" role="group" aria-label={tx("Period")}>{PERIODS.map(([k, l]) => <button key={k} aria-pressed={period === k} onClick={() => setPeriod(k)}>{tx(l)}</button>)}</div>
        {curs.length > 1 && <div className="seg" role="group" aria-label={tx("Currency")}>{curs.map((c) => <button key={c} aria-pressed={cur === c} onClick={() => setCur(c)}>{SYM[c]} {c}</button>)}</div>}
      </div>
      <div className="grid g-4">
        <div className="card stat hero"><p className="label">{tx("Earned {period}", { period: periodLabel })}</p><p className="val num">{money(s.income, cur)}</p><p className="note">{txn(s.incomeRows.length, "{n} paid invoice", "{n} paid invoices")}</p></div>
        <div className="card stat"><p className="label">{tx("Spent")}</p><p className="val num">{money(s.spent, cur)}</p><p className="note">{txn(s.expenseRows.length, "{n} expense", "{n} expenses")}</p></div>
        <div className="card stat"><p className="label" style={{ color: s.profit < 0 ? "var(--danger)" : "var(--success)" }}>{s.profit < 0 ? tx("▼ Loss") : tx("▲ Profit")}</p><p className="val num">{money(Math.abs(s.profit), cur)}</p><p className="note">{s.margin === null ? tx("No income yet in this period") : tx("You keep {margin}% of what you earn", {
          margin: s.margin
        })}</p></div>
        <div className="card stat"><p className="label">{tx("Subscriptions")}</p><p className="val num">{money(Math.round(s.subsMonthly), cur)}<small style={{ fontSize: 14, color: "var(--muted)" }}>{" "}{tx("/month")}</small></p><p className="note">{tx("{n} active · {amount} a year", { n: s.subsCount, amount: money(Math.round(s.subsMonthly * 12), cur) })}</p></div>
      </div>
      {s.owed > 0 && <p className="sub" style={{ fontSize: 14 }}>{tx("Plus {amount} still owed to you on sent invoices.", { amount: money(s.owed, cur) })}</p>}
      <div className="split">
        <MonthChart data={months} cur={cur} />
        <section className="card"><h2 className="h-m" style={{ marginBottom: 12 }}>{tx("Where the money went")}</h2>
          {s.byCategory.length ? s.byCategory.map(([c, v]) => (
            <div key={c} className="catrow">
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 14 }}><span>{tx(c)}</span><b className="num">{money(v, cur)}</b></div>
              <div className="catbar"><i style={{ width: `${(v / maxCat) * 100}%` }} /></div>
            </div>
          )) : <p className="sub">{tx("No spending {period}. Add expenses as you pay for things.", { period: periodLabel })}</p>}
        </section>
      </div>
      <section className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 6 }}>
          <div><h2 className="h-m">{tx("Subscriptions")}</h2><p className="sub" style={{ fontSize: 13 }}>{tx("Adobe, Evoto and the rest. We remind you before they renew.")}</p></div>
          <button className="btn btn-secondary btn-sm" onClick={() => setForm({ kind: "sub" })}><Icon name="plus" />{tx("Add subscription")}</button>
        </div>
        <div className="todo">
          {subs.map((x) => { const n = renewsIn(x); return (
            <div className="todo-item" key={x.id}>
              <span className="dot d-joy"><Icon name="clock" /></span>
              <div className="todo-text"><b>{x.name}</b><span>{money(x.amount, x.currency)} {x.cycle === "yearly" ? tx("a year") : tx("a month")}{x.cycle === "yearly" ? tx(" · {money}/month", {
                money: money(Math.round(monthly(x)), x.currency)
              }) : ""}</span></div>
              <Pill c={n < 0 ? "p-danger" : n <= 7 ? "p-warning" : "p-neutral"}>{n < 0 ? tx("Renewed {n}d ago?", { n: -n }) : n === 0 ? tx("Renews today") : tx("Renews {fdate}", {
                fdate: fdate(x.next_renewal)
              })}</Pill>
              <div style={{ display: "flex", gap: 6 }}>
                {n <= 7 && <button className="btn btn-primary btn-sm" onClick={() => markRenewed(x)}><Icon name="check" />{tx("Paid")}</button>}
                <button className="btn btn-ghost btn-sm" onClick={() => setForm({ kind: "sub", sub: x })}>{tx("Edit")}</button>
                <button className="btn btn-ghost btn-sm" onClick={async () => { await update("subscriptions", x.id, { active: false }); toast(tx("{name} cancelled", {
                  name: x.name
                })); }}>{tx("Cancel")}</button>
              </div>
            </div>
          ); })}
          {!subs.length && <p className="sub" style={{ paddingTop: 8 }}>{tx(
            "No subscriptions yet. Add the tools you pay for to see your monthly cost."
          )}</p>}
        </div>
      </section>
      <section className="card">
        <h2 className="h-m" style={{ marginBottom: 8 }}>{tx("Expenses {period}", { period: periodLabel })}</h2>
        {!expenses.length ? <Empty icon="receipt" title={tx("No expenses yet")} text={tx("Log gear, travel, rent and crew costs so you know your real profit.")} action={<button className="btn btn-primary" onClick={() => setForm({ kind: "expense" })}>{tx("Add expense")}</button>} /> : (
          <div className="tablewrap"><table><thead><tr><th>{tx("Date")}</th><th>{tx("Paid to")}</th><th>{tx("Category")}</th><th className="right">{tx("Amount")}</th><th /></tr></thead><tbody>
            {[...s.expenseRows].sort((a, b) => (a.spent_on < b.spent_on ? 1 : -1)).map((e) => (
              <tr key={e.id}>
                <td>{fdate(e.spent_on)}</td>
                <td><b>{e.vendor}</b>{e.note && <small style={{ display: "block", color: "var(--muted)", fontSize: 12 }}>{e.note}</small>}</td>
                <td><Pill c="p-neutral">{e.category}</Pill></td>
                <td className="right num"><b>{money(e.amount, e.currency)}</b></td>
                <td className="right"><button className="btn btn-ghost btn-sm" aria-label={tx("Delete {vendor}", {
                  vendor: e.vendor
                })} onClick={async () => { await remove("expenses", e.id); toast(tx("Expense deleted")); }}><Icon name="x" /></button></td>
              </tr>
            ))}
            {!s.expenseRows.length && <tr><td colSpan={5} className="sub">{tx("Nothing in {cur} {period}.", { cur, period: periodLabel })}</td></tr>}
          </tbody></table></div>
        )}
      </section>
      {form?.kind === "expense" && <ExpenseForm cur={cur} onClose={() => setForm(null)} />}
      {form?.kind === "sub" && <SubscriptionForm cur={cur} sub={form.sub} onClose={() => setForm(null)} />}
    </>
  );
}
