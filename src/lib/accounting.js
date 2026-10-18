// Accounting maths shared by the web and phone apps. Plain JS, no React.
import { tx } from "./i18n";
import { fmonth } from "./format";

export const EXPENSE_CATEGORIES = [
  "Software and subscriptions", "Equipment", "Travel", "Studio and rent", "Props and wardrobe",
  "Crew and assistants", "Marketing", "Printing and albums", "Fees and bank charges", "Other",
];

// Tools creatives told us they pay for. Prices vary by plan and country, so the user types their own.
export const SUBSCRIPTION_PRESETS = [
  "Adobe Creative Cloud", "Lightroom", "Evoto", "Capture One", "Imagen AI", "Aftershoot",
  "Canva Pro", "CapCut Pro", "Artlist", "Epidemic Sound", "Envato Elements",
  "Google Workspace", "Dropbox", "iCloud+", "Squarespace", "Pixieset",
];

export const PERIODS = [
  ["month", "This month"], ["last", "Last month"], ["quarter", "This quarter"], ["year", "This year"], ["all", "All time"],
];

const pad = (n) => String(n).padStart(2, "0");
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export function periodRange(key, now = new Date()) {
  const y = now.getFullYear(), m = now.getMonth();
  if (key === "month") return [iso(new Date(y, m, 1)), iso(new Date(y, m + 1, 0))];
  if (key === "last") return [iso(new Date(y, m - 1, 1)), iso(new Date(y, m, 0))];
  if (key === "quarter") { const q = Math.floor(m / 3) * 3; return [iso(new Date(y, q, 1)), iso(new Date(y, q + 3, 0))]; }
  if (key === "year") return [iso(new Date(y, 0, 1)), iso(new Date(y, 11, 31))];
  return ["0000-01-01", "9999-12-31"];
}

const day = (s) => String(s || "").slice(0, 10);
export const paidDay = (i) => day(i.paid_at || i.created_at);
const inRange = (d, [a, b]) => d >= a && d <= b;

// Every amount that actually came in on an invoice, on the day it came in:
// each part payment you recorded, plus the rest on the day it was marked paid.
export function receipts(i) {
  if (i.kind === "quote") return [];
  const pays = (Array.isArray(i.payments) ? i.payments : []).filter((p) => Number(p.amount) > 0);
  const psum = pays.reduce((s, p) => s + Number(p.amount), 0);
  const out = pays.map((p) => ({ ...i, amount: Number(p.amount), paid_at: p.date || i.paid_at || i.updated_at || i.created_at, part: true, method: p.method }));
  const recorded = Math.max(Number(i.amount_paid || 0), psum);
  if (recorded > psum + 0.001) out.push({ ...i, amount: recorded - psum, paid_at: i.updated_at || i.created_at, part: true });
  if (i.status === "paid") { const rest = Math.max(0, Number(i.amount) - recorded); if (rest > 0.001 || !out.length) out.push({ ...i, amount: rest }); }
  return out;
}
export const paidIn = (invoices, range, cur) =>
  invoices.filter((i) => i.currency === cur).flatMap(receipts).filter((r) => inRange(paidDay(r), range));
export const spentIn = (expenses, range, cur) =>
  expenses.filter((e) => e.currency === cur && inRange(day(e.spent_on), range));
const sum = (list) => list.reduce((s, x) => s + Number(x.amount || 0), 0);

export const monthly = (s) => (s.cycle === "yearly" ? Number(s.amount) / 12 : Number(s.amount));

export function summary({ invoices, expenses, subscriptions }, periodKey, cur) {
  const range = periodRange(periodKey);
  const inc = paidIn(invoices, range, cur);
  const exp = spentIn(expenses, range, cur);
  const income = sum(inc), spent = sum(exp);
  const subs = subscriptions.filter((s) => s.active && s.currency === cur);
  // Still owed: what's left after part payments
  const owed = invoices.filter((i) => i.status === "sent" && i.kind !== "quote" && i.currency === cur).map((i) => ({ amount: Math.max(0, Number(i.amount) - Number(i.amount_paid || 0)) }));
  const cats = {};
  exp.forEach((e) => { cats[e.category] = (cats[e.category] || 0) + Number(e.amount); });
  return {
    range, income, spent, profit: income - spent,
    margin: income > 0 ? Math.round(((income - spent) / income) * 100) : null,
    subsMonthly: subs.reduce((s, x) => s + monthly(x), 0),
    subsCount: subs.length,
    owed: sum(owed),
    byCategory: Object.entries(cats).sort((a, b) => b[1] - a[1]),
    incomeRows: inc, expenseRows: exp,
  };
}

// Income and spending for the last n months, oldest first
export function lastMonths({ invoices, expenses }, cur, n = 6, now = new Date()) {
  const out = [];
  for (let k = n - 1; k >= 0; k--) {
    const a = new Date(now.getFullYear(), now.getMonth() - k, 1);
    const r = [iso(a), iso(new Date(a.getFullYear(), a.getMonth() + 1, 0))];
    out.push({ label: fmonth(a), income: sum(paidIn(invoices, r, cur)), spent: sum(spentIn(expenses, r, cur)) });
  }
  return out;
}

// Which currencies does this studio actually use? Home first.
export function usedCurrencies({ invoices, expenses, subscriptions }, home) {
  const set = new Set([home]);
  [...invoices, ...expenses, ...subscriptions].forEach((x) => x.currency && set.add(x.currency));
  return [...set];
}

export function renewsIn(s, now = new Date()) {
  const t = new Date(now); t.setHours(0, 0, 0, 0);
  return Math.round((new Date(day(s.next_renewal) + "T00:00:00") - t) / 864e5);
}
export function nextRenewalAfter(s) {
  const d = new Date(day(s.next_renewal) + "T00:00:00");
  if (s.cycle === "yearly") d.setFullYear(d.getFullYear() + 1); else d.setMonth(d.getMonth() + 1);
  return iso(d);
}

// One CSV with both sides, ready for an accountant or a spreadsheet
export function toCSV({ incomeRows, expenseRows }, clientName) {
  const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const rows = [["Date", "Type", "Who", "Description", "Category", "Currency", "Amount"].map((h) => tx(h))];
  incomeRows.forEach((i) => rows.push([paidDay(i), tx("Income"), clientName(i.client_id), `${tx("Invoice")} #${i.number} ${i.label}`, tx("Client work"), i.currency, Number(i.amount).toFixed(2)]));
  expenseRows.forEach((e) => rows.push([day(e.spent_on), tx("Expense"), e.vendor, e.note, tx(e.category), e.currency, (-Number(e.amount)).toFixed(2)]));
  rows.splice(1, rows.length - 1, ...rows.slice(1).sort((a, b) => (a[0] < b[0] ? -1 : 1)));
  return rows.map((r) => r.map(esc).join(",")).join("\n");
}
