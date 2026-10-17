// Jovita speaks English, French, Spanish, Portuguese and Swahili.
// Strings are written in English in the code and looked up here: tx("Add client") → "Ajouter un client".
// Missing translations fall back to English, so nothing ever shows blank.
import fr from "../locales/fr.json";
import es from "../locales/es.json";
import pt from "../locales/pt.json";
import sw from "../locales/sw.json";

export const LANGS = [["en", "English"], ["fr", "Français"], ["es", "Español"], ["pt", "Português"], ["sw", "Kiswahili"]];
const DICT = { en: {}, fr, es, pt, sw };

// Where a country's people most likely want the app
const COUNTRY_LANG = {
  // French
  CI: "fr", SN: "fr", CM: "fr", BJ: "fr", TG: "fr", ML: "fr", BF: "fr", NE: "fr", GN: "fr", GA: "fr", CG: "fr", CD: "fr",
  TD: "fr", CF: "fr", MG: "fr", RW: "fr", BI: "fr", DJ: "fr", KM: "fr", MA: "fr", DZ: "fr", TN: "fr", HT: "fr",
  FR: "fr", BE: "fr", LU: "fr", MC: "fr", CH: "fr",
  // Spanish
  ES: "es", MX: "es", AR: "es", CO: "es", CL: "es", PE: "es", VE: "es", EC: "es", GT: "es", CU: "es", BO: "es",
  DO: "es", HN: "es", PY: "es", SV: "es", NI: "es", CR: "es", PA: "es", UY: "es", PR: "es", GQ: "es",
  // Portuguese
  PT: "pt", BR: "pt", AO: "pt", MZ: "pt", CV: "pt", GW: "pt", ST: "pt", TL: "pt",
  // Swahili
  TZ: "sw", KE: "sw", UG: "sw",
};
const LOCALE = { en: "en-GB", fr: "fr-FR", es: "es-ES", pt: "pt-PT", sw: "sw-TZ" };

let lang = "en";
let country = "";
export const getLang = () => lang;
export const isLang = (l) => Object.prototype.hasOwnProperty.call(DICT, l);
export const langForCountry = (cc) => COUNTRY_LANG[String(cc || "").toUpperCase()];

// Saved choice → studio setting → where you are → your phone/browser language → English
export function pickLang({ saved, studio, cc, device = [] }) {
  for (const l of [saved, studio, langForCountry(cc), ...device.map((d) => String(d || "").slice(0, 2).toLowerCase())]) {
    if (l && isLang(l)) return l;
  }
  return "en";
}
export function setLang(l, cc) {
  lang = isLang(l) ? l : "en";
  if (cc) country = String(cc).toUpperCase();
}
// e.g. fr-CI so CFA amounts and dates read the way people in Abidjan write them
export const locale = () => (country && lang !== "en" && langForCountry(country) === lang ? `${lang}-${country}` : LOCALE[lang]);

export function tx(s, vars) {
  let out = DICT[lang]?.[s] || s;
  if (vars) out = out.replace(/\{(\w+)\}/g, (m, k) => (vars[k] ?? m));
  return out;
}
// Pick singular or plural: txn(n, "{n} invoice", "{n} invoices")
export const txn = (n, one, many, vars = {}) => tx(n === 1 ? one : many, { n, ...vars });

// Where you are, without asking: the browser's region (en-NG) or time zone (Africa/Lagos)
const TZ_CC = { "Africa/Lagos": "NG", "Europe/London": "GB", "Africa/Accra": "GH", "Africa/Abidjan": "CI", "Africa/Dakar": "SN", "Africa/Porto-Novo": "BJ", "Africa/Lome": "TG", "Africa/Bamako": "ML", "Africa/Ouagadougou": "BF", "Africa/Niamey": "NE", "Africa/Douala": "CM", "Africa/Libreville": "GA", "Africa/Nairobi": "KE", "Africa/Dar_es_Salaam": "TZ", "Africa/Kampala": "UG", "Africa/Johannesburg": "ZA", "Europe/Paris": "FR", "Europe/Madrid": "ES", "Europe/Lisbon": "PT", "America/Sao_Paulo": "BR", "Africa/Luanda": "AO", "Africa/Maputo": "MZ" };
export function guessCountry(cookie = "") {
  if (cookie) return cookie.toUpperCase();
  // Time zone first (it follows where the laptop is), then the browser's region
  try { const tz = Intl.DateTimeFormat().resolvedOptions().timeZone; if (TZ_CC[tz]) return TZ_CC[tz]; } catch { /* old browser */ }
  for (const l of navigator.languages || [navigator.language]) { const m = String(l || "").match(/-([A-Z]{2})$/i); if (m) return m[1].toUpperCase(); }
  return "";
}
const CFA = ["CI", "SN", "BJ", "TG", "ML", "BF", "NE", "GW", "CM", "GA", "CG", "TD", "CF", "GQ"];
const EURO = ["FR", "BE", "LU", "MC", "ES", "PT", "IE", "DE", "IT", "NL", "AT", "FI", "GR"];
// The money people most likely work in, for a language (and country when we know it)
export function currencyFor(l, cc = "") {
  cc = String(cc || "").toUpperCase();
  if (cc === "NG" && l !== "fr") return "NGN";
  if (cc === "GB" && l === "en") return "GBP";
  if (l === "fr") return CFA.includes(cc) || !cc || cc === "NG" ? "XOF" : "EUR";
  if (l === "es" || l === "pt") return !cc || EURO.includes(cc) ? "EUR" : "USD";
  if (l === "sw") return "USD";
  if (EURO.includes(cc)) return "EUR";
  if (cc === "US") return "USD";
  return cc ? "USD" : "NGN";
}
