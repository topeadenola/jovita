import { createContext, createElement, Fragment, useCallback, useContext, useState } from "react";
import { getLocales } from "expo-localization";
import { getLang, pickLang, setLang } from "./i18n";

// On a phone, the region setting tells us the country (CI → French, ES → Spanish)
// and the language setting is the fallback. A choice made in the app always wins.
const KEY = "jovita-lang";
const read = () => { try { return globalThis.localStorage?.getItem(KEY) || ""; } catch { return ""; } };
const write = (v) => { try { if (v) globalThis.localStorage?.setItem(KEY, v); else globalThis.localStorage?.removeItem(KEY); } catch { /* ignore */ } };
const device = () => { try { return getLocales() || []; } catch { return []; } };
const region = () => device()[0]?.regionCode || "";

export function initLang() {
  setLang(pickLang({ saved: read(), cc: region(), device: device().map((l) => l.languageCode) }), region());
}

const Ctx = createContext({ lang: "en", change: () => {} });
export const useLang = () => useContext(Ctx);

export function LangProvider({ children }) {
  const [lang, setState] = useState(getLang());
  const change = useCallback((l, { persist = true, auto = false } = {}) => {
    if (auto && read()) return;
    if (persist) write(l);
    setLang(l || pickLang({ cc: region(), device: device().map((d) => d.languageCode) }), region());
    setState(getLang());
  }, []);
  // Changing the key redraws every screen in the new language
  return createElement(Ctx.Provider, { value: { lang, change } }, createElement(Fragment, { key: lang }, children));
}
