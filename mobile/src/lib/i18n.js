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
