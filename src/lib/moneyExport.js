// "Export for accountant": one Excel workbook with everything in Money for a period.
// Sheets: Summary (per currency), Money in, Invoices, Quotes, Expenses, Subscriptions.
import { tx } from "./i18n";
import { invState, balanceOf } from "./format";
import { periodRange, paidIn, spentIn, monthly, paidDay, usedCurrencies, PERIODS } from "./accounting";

const day = (s) => String(s || "").slice(0, 10);
const inRange = (d, [a, b]) => d >= a && d <= b;
const n2 = (v) => Math.round(Number(v || 0) * 100) / 100;

export function moneyWorkbookRows(data, periodKey, clientName, projectName) {
  const { invoices = [], expenses = [], subscriptions = [], studio = {} } = data;
  const range = periodRange(periodKey);
  const curs = usedCurrencies(data, studio.home_currency || "NGN");
  const issued = (i) => day(i.created_at);

  const summary = [[tx("Currency"), tx("Money in"), tx("Spent"), tx("Profit"), tx("Still owed (all time)"), tx("Subscriptions a month")]];
  const moneyIn = [[tx("Date"), tx("Client"), tx("Invoice"), tx("Description"), tx("Method"), tx("Currency"), tx("Amount")]];
  curs.forEach((c) => {
    const inc = paidIn(invoices, range, c);
    const exp = spentIn(expenses, range, c);
    const a = inc.reduce((s, x) => s + Number(x.amount || 0), 0), b = exp.reduce((s, x) => s + Number(x.amount || 0), 0);
    const owed = invoices.filter((i) => i.kind !== "quote" && i.status === "sent" && i.currency === c).reduce((s, i) => s + balanceOf(i), 0);
    const subs = subscriptions.filter((x) => x.active && x.currency === c).reduce((s, x) => s + monthly(x), 0);
    if (a || b || owed || subs) summary.push([c, n2(a), n2(b), n2(a - b), n2(owed), n2(subs)]);
    inc.forEach((r) => moneyIn.push([paidDay(r), clientName(r.client_id), r.number ? `#${r.number}` : "", r.label || "", r.method || "", c, n2(r.amount)]));
  });
  moneyIn.splice(1, moneyIn.length - 1, ...moneyIn.slice(1).sort((x, y) => (x[0] < y[0] ? -1 : 1)));

  const docRow = (i) => [i.number ? `#${i.number}` : "", clientName(i.client_id), i.project_id ? projectName(i.project_id) : "", i.label || "", issued(i), day(i.due_date), tx(invState(i).k), i.currency, n2(i.amount), n2(i.amount_paid), n2(balanceOf(i))];
  const head = [tx("Number"), tx("Client"), tx("Project"), tx("Description"), tx("Issued"), tx("Due"), tx("Status"), tx("Currency"), tx("Total"), tx("Paid"), tx("Balance")];
  const inPeriod = (i) => inRange(issued(i), range);
  const byDate = (a, b) => (issued(a) < issued(b) ? -1 : 1);
  const inv = [head, ...invoices.filter((i) => i.kind !== "quote" && i.status !== "draft" && inPeriod(i)).sort(byDate).map(docRow)];
  const quotes = [head.slice(0, 9), ...invoices.filter((i) => i.kind === "quote" && i.status !== "draft" && inPeriod(i)).sort(byDate).map((i) => docRow(i).slice(0, 9))];

  const exp = [[tx("Date"), tx("Paid to"), tx("Category"), tx("Note"), tx("Project"), tx("Currency"), tx("Amount")],
    ...expenses.filter((e) => inRange(day(e.spent_on), range)).sort((a, b) => (day(a.spent_on) < day(b.spent_on) ? -1 : 1))
      .map((e) => [day(e.spent_on), e.vendor || "", tx(e.category), e.note || "", e.project_id ? projectName(e.project_id) : "", e.currency, n2(e.amount)])];

  const subs = [[tx("Name"), tx("Billed"), tx("Currency"), tx("Amount"), tx("A month"), tx("Next renewal"), tx("Status")],
    ...subscriptions.map((x) => [x.name, x.cycle === "yearly" ? tx("Yearly") : tx("Monthly"), x.currency, n2(x.amount), n2(monthly(x)), day(x.next_renewal), x.active ? tx("Active") : tx("Cancelled")])];

  return { range, sheets: [[tx("Summary"), summary], [tx("Money in"), moneyIn], [tx("Invoices"), inv], [tx("Quotes"), quotes], [tx("Expenses"), exp], [tx("Subscriptions"), subs]] };
}

export async function downloadMoneyWorkbook(data, periodKey, clientName, projectName) {
  const XLSX = await import("xlsx");
  const { range, sheets } = moneyWorkbookRows(data, periodKey, clientName, projectName);
  const wb = XLSX.utils.book_new();
  const label = tx(PERIODS.find((p) => p[0] === periodKey)?.[1] || "");
  sheets.forEach(([name, rows], k) => {
    const top = k === 0 ? [[data.studio?.name || "Jovita"], [`${label}${periodKey === "all" ? "" : ` (${range[0]} – ${range[1]})`}`], []] : [];
    const ws = XLSX.utils.aoa_to_sheet([...top, ...rows]);
    const w = rows[0].map((_, c) => Math.min(40, Math.max(10, ...rows.map((r) => String(r[c] ?? "").length + 2))));
    ws["!cols"] = w.map((wch) => ({ wch }));
    XLSX.utils.book_append_sheet(wb, ws, name.slice(0, 31));
  });
  const file = `jovita-money-${periodKey === "all" ? "all-time" : range[0] + "-to-" + range[1]}.xlsx`;
  XLSX.writeFile(wb, file);
  return file;
}
