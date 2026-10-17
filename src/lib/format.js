import { locale, tx } from "./i18n";

export const SYM = { NGN: "₦", GBP: "£", USD: "$", EUR: "€", XOF: "CFA" };
export const CURRENCIES = ["NGN", "GBP", "USD", "EUR", "XOF"];
export const CURRENCY_NAME = { NGN: "Naira", GBP: "Pound", USD: "Dollar", EUR: "Euro", XOF: "CFA franc" };
export const STAGES = ["inquiry", "booked", "shooting", "editing", "delivered"];
export const STAGE_LABEL = { inquiry: "Inquiry", booked: "Booked", shooting: "Shooting", editing: "Editing", delivered: "Delivered" };
export const PROJECT_TYPES = ["Portrait", "Wedding", "Family", "Videography", "Commercial", "Makeup", "Styling", "Design"];

const DAY = 864e5;
// Dates follow the app language: "Mon 12 Oct", "lun. 12 oct.", "lun, 12 oct"
const fmt = (opts) => { try { return new Intl.DateTimeFormat(locale(), opts); } catch { return new Intl.DateTimeFormat("en-GB", opts); } };
const clean = (s) => s.replace(/,/g, "");

export const todayISO = () => isoDay(new Date());
export const isoDay = (dt) => {
  const x = new Date(dt);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
};
export const addDays = (n) => isoDay(new Date(Date.now() + n * DAY));
const parse = (s) => new Date(String(s).slice(0, 10) + "T00:00:00");
export const daysFrom = (s) => {
  const t = new Date(); t.setHours(0, 0, 0, 0);
  return Math.round((parse(s) - t) / DAY);
};
export const fdate = (s) => (s ? clean(fmt({ day: "numeric", month: "short" }).format(parse(s))) : "—");
export const fday = (s) => (s ? clean(fmt({ weekday: "short", day: "numeric", month: "short" }).format(parse(s))) : tx("Date to be set"));
export const ftime = (ts) => fmt({ hour: "2-digit", minute: "2-digit" }).format(new Date(ts));
export const fmonth = (d) => clean(fmt({ month: "short" }).format(d));
export const dow = (s) => clean(fmt({ weekday: "short" }).format(parse(s))).replace(/\.$/, "");
export const dom = (s) => parse(s).getDate();
export const ago = (ts) => {
  const m = Math.round((Date.now() - new Date(ts)) / 6e4);
  if (m < 1) return tx("Now");
  if (m < 60) return `${m}m`;
  if (m < 1440) return `${Math.round(m / 60)}h`;
  return fdate(ts);
};

// Money follows the app language too: ₦520,000 · 520 000 F CFA · 1.250,50 €
const WHOLE = { NGN: true, XOF: true };
export const money = (n, c) => {
  const v = Number(n || 0);
  try {
    return new Intl.NumberFormat(locale(), { style: "currency", currency: c || "NGN", currencyDisplay: "narrowSymbol", minimumFractionDigits: 0, maximumFractionDigits: WHOLE[c] ? 0 : 2 }).format(v);
  } catch {
    return (SYM[c] || "") + v.toLocaleString("en-GB", { maximumFractionDigits: 2 });
  }
};
export const short = (n, c) => {
  n = Number(n || 0);
  if (n >= 1e4 && WHOLE[c]) {
    try { return new Intl.NumberFormat(locale(), { style: "currency", currency: c, currencyDisplay: "narrowSymbol", notation: "compact", maximumFractionDigits: 1 }).format(n); } catch { /* fall through */ }
  }
  return money(n, c);
};
export const initials = (n = "") => n.split(/\s+/).filter(Boolean).map((w) => w[0]).slice(0, 2).join("").toUpperCase() || "?";
export const first = (n = "") => n.split(" ")[0];

export function invState(i) {
  if (i.status === "paid") return { k: "Paid", c: "p-success" };
  if (i.status === "draft") return { k: "Draft", c: "p-neutral" };
  if (i.status === "cancelled") return { k: "Cancelled", c: "p-neutral" };
  if (i.payment_reported_at) return { k: "Check payment", c: "p-info" };
  const n = daysFrom(i.due_date);
  if (n < 0) return { k: "Overdue", c: "p-danger", late: -n };
  if (n <= 7) return { k: "Due soon", c: "p-warning" };
  return { k: "Sent", c: "p-info" };
}

export function nextStep(p) {
  if (p.stage === "inquiry") return { t: tx("Send quote"), a: "quote" };
  if (!p.contract_signed) return { t: tx("Resend contract"), a: "contract" };
  if (!p.deposit_paid) return { t: tx("Chase deposit"), a: "deposit" };
  if (p.stage === "booked") return { t: tx("Mark as shooting"), a: "advance" };
  if (p.stage === "shooting") return { t: tx("Mark as shot"), a: "advance" };
  if (p.stage === "editing") return { t: tx("Deliver gallery"), a: "deliver" };
  return { t: tx("Ask for a review"), a: "review" };
}

export function projPill(p) {
  if (p.stage === "inquiry") return { k: "New inquiry", c: "p-info" };
  if (!p.contract_signed) return { k: "Unsigned", c: "p-warning" };
  if (!p.deposit_paid) return { k: "Awaiting deposit", c: "p-warning" };
  if (p.stage === "delivered") return { k: "Delivered", c: "p-success" };
  return { k: STAGE_LABEL[p.stage], c: "p-neutral" };
}

export function totalsBy(list, field = "amount") {
  const out = {};
  list.forEach((i) => { out[i.currency] = (out[i.currency] || 0) + Number(i[field] || 0); });
  return out;
}
export function totalLine(t, home) {
  const main = money(t[home] || 0, home);
  const others = Object.keys(t).filter((k) => k !== home && t[k]).map((k) => money(t[k], k));
  return { main, others: others.length ? "+ " + others.join(", ") : tx("All in {home}", { home }) };
}

export const portalUrl = (token) => `${window.location.origin}/p/${token}`;

// Changing language moves the studio to that language's usual currency (you can change it back in Settings)
import { currencyFor, guessCountry } from "./i18n";
export function langPatch(studio, l) {
  const patch = { language: l };
  const cur = l ? currencyFor(l, guessCountry()) : null;
  if (cur && cur !== studio.home_currency) patch.home_currency = cur;
  return patch;
}
