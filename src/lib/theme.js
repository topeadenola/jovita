// Bright, dark or automatic (follows the phone/computer). Saved on this device and on the studio.
const KEY = "jv_theme";
const mq = () => window.matchMedia?.("(prefers-color-scheme: dark)");

export function getSaved() {
  try { return localStorage.getItem(KEY) || "auto"; } catch { return "auto"; }
}
export function resolve(mode) {
  return mode === "dark" || (mode === "auto" && mq()?.matches) ? "dark" : "light";
}
export function applyTheme(mode) {
  const m = ["light", "dark", "auto"].includes(mode) ? mode : "auto";
  try { localStorage.setItem(KEY, m); } catch { /* private mode */ }
  const t = resolve(m);
  document.documentElement.dataset.theme = t;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", t === "dark" ? "#17101F" : "#261433");
  window.dispatchEvent(new CustomEvent("jovita:theme", { detail: { mode: m, theme: t } }));
  return t;
}
// Keep "auto" in step when the system switches
export function watchSystem() {
  const m = mq();
  if (!m) return;
  m.addEventListener?.("change", () => { if (getSaved() === "auto") applyTheme("auto"); });
}
