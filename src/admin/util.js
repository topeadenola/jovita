export const SYM = { NGN: "₦", GBP: "£", USD: "$", EUR: "€", XOF: "CFA ", GHS: "GH₵", KES: "KSh" };
export const PLANS = [["free", "Free"], ["pro", "Pro"], ["studio", "Studio"]];
export const PLAN_LABEL = { free: "Free", pro: "Pro", studio: "Studio" };
export const COUNTRY = { NG: "Nigeria", GB: "United Kingdom", GH: "Ghana", US: "United States", KE: "Kenya", CI: "Côte d'Ivoire", FR: "France", SN: "Senegal", ZA: "South Africa", TZ: "Tanzania", NGN: "Naira studios", GBP: "Pound studios", USD: "Dollar studios", EUR: "Euro studios", XOF: "CFA studios" };
export const LANG = { en: "English", fr: "Français", es: "Español", pt: "Português", sw: "Kiswahili", auto: "Automatic" };

export const n = (v) => new Intl.NumberFormat("en-GB").format(Math.round(v || 0));
export function money(v, cur = "NGN", compact = true) {
  const s = SYM[cur] || cur + " ";
  const a = Math.abs(v || 0);
  if (compact && a >= 1e9) return s + (v / 1e9).toFixed(1).replace(/\.0$/, "") + "B";
  if (compact && a >= 1e6) return s + (v / 1e6).toFixed(1).replace(/\.0$/, "") + "M";
  if (compact && a >= 1e5) return s + (v / 1e3).toFixed(0) + "K";
  return s + new Intl.NumberFormat("en-GB", { maximumFractionDigits: cur === "NGN" || cur === "XOF" ? 0 : 2 }).format(v || 0);
}
// The biggest currency first
export const byValue = (obj = {}) => Object.entries(obj).filter(([, v]) => v).sort((a, b) => b[1] - a[1]);
export function delta(now, before) {
  if (!before) return now ? { cls: "up", text: "New" } : { cls: "flat", text: "0%" };
  const p = Math.round(((now - before) / before) * 100);
  return { cls: p > 0 ? "up" : p < 0 ? "down" : "flat", text: (p > 0 ? "+" : "") + p + "%" };
}
export function ago(ts) {
  if (!ts) return "Never";
  const m = Math.round((Date.now() - new Date(ts)) / 6e4);
  if (m < 1) return "Just now"; if (m < 60) return m + "m ago";
  const h = Math.round(m / 60); if (h < 24) return h + "h ago";
  const d = Math.round(h / 24); if (d < 30) return d + "d ago";
  return new Date(ts).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: d > 330 ? "numeric" : undefined });
}
export const date = (ts) => (ts ? new Date(ts).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—");
export const initials = (s = "?") => s.split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
export function greeting() { const h = new Date().getHours(); return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening"; }

export const EVENT = {
  signup: ["New studio", "users", ""], onboarded: ["Finished setup", "check", "good"], upgrade: ["Upgraded", "up", "gold"], downgrade: ["Downgraded", "down", "bad"],
  cancel: ["Cancelled paid plan", "down", "bad"], client_added: ["Added a client", "users", ""], project_created: ["Started a project", "folder", ""],
  invoice_sent: ["Sent an invoice", "send", ""], invoice_paid: ["Got paid", "wallet", "good"], gallery_published: ["Published a gallery", "image", ""], payment_failed: ["Payment failed", "alert", "bad"],
  renewed: ["Paid for more time", "wallet", "good"], renewal_reminder: ["Sent a renewal reminder", "send", ""], plan_ended: ["Plan ended", "down", "bad"],
  gift: ["Got gift access", "trophy", "gold"], gift_ended: ["Gift access ended", "down", ""],
  trial_started: ["Started a Pro trial", "trophy", "gold"], trial_ended: ["Pro trial ended", "down", ""], upgrade_request: ["Asked to upgrade", "up", "gold"], downgrade_request: ["Asked to downgrade", "down", "bad"],
};
export function eventText(e) {
  const m = e.meta || {};
  if (e.kind === "upgrade" || e.kind === "downgrade" || e.kind === "cancel") return `${PLAN_LABEL[m.from] || m.from} → ${PLAN_LABEL[m.to] || m.to}`;
  if (e.kind === "upgrade_request" || e.kind === "downgrade_request") return `wants ${PLAN_LABEL[m.plan] || m.plan}`;
  // HQ shows what studios do, never their money
  if (e.kind === "renewed") return `${PLAN_LABEL[m.plan] || m.plan} · ${m.months} ${m.months === 1 ? "month" : "months"}`;
  if (e.kind === "renewal_reminder") return m.days ? `${m.days} ${m.days === 1 ? "day" : "days"} left` : "plan ended";
  if (e.kind === "gift") return `${PLAN_LABEL[m.plan] || m.plan}${m.until ? " until " + new Date(m.until).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : ""}`;
  if (e.kind === "signup" && m.email) return m.email;
  return "";
}

// Time left on a plan with an end date: { text, tone, days }
export function timeLeft(until) {
  if (!until) return null;
  const days = Math.ceil((new Date(until).getTime() - Date.now()) / 864e5);
  if (days < 0) return { days, text: `Ended ${-days} ${days === -1 ? "day" : "days"} ago`, tone: "p-bad" };
  if (days === 0) return { days, text: "Ends today", tone: "p-bad" };
  if (days <= 7) return { days, text: `${days} ${days === 1 ? "day" : "days"} left`, tone: "p-warn" };
  if (days < 62) return { days, text: `${days} days left`, tone: "p-good" };
  const m = Math.floor(days / 30.4);
  return { days, text: `${m} months left`, tone: "p-good" };
}

export function toCSV(rows, cols) {
  const esc = (v) => { const s = v == null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return [cols.map((c) => c[1]).join(","), ...rows.map((r) => cols.map((c) => esc(typeof c[0] === "function" ? c[0](r) : r[c[0]])).join(","))].join("\n");
}
export function download(name, text) {
  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" })); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 3000);
}
