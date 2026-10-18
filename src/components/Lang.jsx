import { createContext, useCallback, useContext, useState } from "react";
import { LANGS, getLang, guessCountry, pickLang, setLang, tx } from "../lib/i18n";

const KEY = "jovita-lang";
const read = () => { try { return localStorage.getItem(KEY) || ""; } catch { return ""; } };
const write = (v) => { try { if (v) localStorage.setItem(KEY, v); else localStorage.removeItem(KEY); } catch { /* private mode */ } };
// A jv_country cookie (if the host sets one) tells us the visitor's country
// Locally (no Netlify) we fall back to the browser's region or time zone
export const countryCookie = () => guessCountry((document.cookie.match(/(?:^|; )jv_country=([A-Z]{2})/) || [])[1] || "");

// Decide before the first paint so nobody sees English flash past
export function initLang() {
  // Coming from the landing page in another language: ?lang=fr
  const fromUrl = new URLSearchParams(location.search).get("lang");
  if (fromUrl && LANGS.some(([k]) => k === fromUrl)) write(fromUrl);
  setLang(pickLang({ saved: read(), cc: countryCookie(), device: navigator.languages || [navigator.language] }), countryCookie());
  document.documentElement.lang = getLang();
}

const Ctx = createContext({ lang: "en", change: () => {} });
export const useLang = () => useContext(Ctx);

export function LangProvider({ children }) {
  const [lang, setState] = useState(getLang());
  // persist=true when the person picks it; studio language applies quietly unless they've picked one
  const change = useCallback((l, { persist = true, auto = false } = {}) => {
    if (auto && read()) return;
    if (persist) write(l);
    setLang(l || pickLang({ cc: countryCookie(), device: navigator.languages || [] }), countryCookie());
    document.documentElement.lang = getLang();
    setState(getLang());
  }, []);
  // key={lang} remounts the app so every label re-renders in the new language
  return <Ctx.Provider value={{ lang, change }}><div key={lang} style={{ display: "contents" }}>{children}</div></Ctx.Provider>;
}

export function LangSwitch({ compact, className = "", onPick }) {
  const { lang, change } = useLang();
  return (
    <label className={`langswitch ${compact ? "compact" : ""} ${className}`}>
      <svg viewBox="0 0 24 24" className="ic" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" /></svg>
      <span className="sr">{tx("Language")}</span>
      <select value={lang} aria-label={tx("Language")} onChange={(e) => { change(e.target.value); onPick?.(e.target.value); }}>
        {LANGS.map(([k, n]) => <option key={k} value={k}>{compact ? k.toUpperCase() : n}</option>)}
      </select>
    </label>
  );
}
