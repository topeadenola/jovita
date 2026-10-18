import { useState } from "react";
import { useData } from "../lib/data";
import { useToast } from "../components/ui";
import Jo from "../components/Jo";
import { CURRENCIES, SYM } from "../lib/format";
import { LANGS, currencyFor, getLang, guessCountry, tx } from "../lib/i18n";
import { useLang } from "../components/Lang";

const HELLO = { en: "Hello", fr: "Bonjour", es: "Hola", pt: "Olá", sw: "Habari" };
// Survives the redraw that happens when the language changes
const kept = { step: 0, picked: null };

const CAREERS = [["📷", "Photographer"], ["🎬", "Videographer"], ["💄", "Makeup artist"], ["📱", "Content creator"], ["🎨", "Designer"], ["✂️", "Stylist"], ["✨", "Something else"]];

// First run for a new studio: your language → what you do → your studio → done.
export default function Onboarding() {
  const { studio, updateStudio } = useData();
  const toast = useToast();
  const { change } = useLang();
  const [step, setStepRaw] = useState(kept.step);
  const setStep = (n) => { kept.step = n; setStepRaw(n); };
  const [picked, setPickedRaw] = useState(() => kept.picked || new Set(studio.careers || []));
  const setPicked = (fn) => setPickedRaw((s) => { const x = fn(s); kept.picked = x; return x; });
  const [lang, setLangPick] = useState(studio.language || getLang());
  const [f, setF] = useState({ name: studio.name === "My studio" ? "" : studio.name, owner_first_name: studio.owner_first_name, home_currency: kept.cur || studio.home_currency });
  const pickLang = (l) => {
    const cur = currencyFor(l, guessCountry());
    kept.cur = cur;
    setLangPick(l);
    setF((x) => ({ ...x, home_currency: cur }));
    updateStudio({ language: l, home_currency: cur }).catch(() => {});
    change(l);
  };
  const [busy, setBusy] = useState(false);

  const names = CAREERS.map((c) => c[1]).filter((n) => picked.has(n));
  const joSays = step === 0 ? tx("Hi{name}! I'm Jo. Which language should Jovita speak?", { name: studio.owner_first_name ? " " + String(studio.owner_first_name || "").split(" ")[0] : "" })
    : step === 2 ? tx("Lovely. What's your studio called? Clients see this on every invoice.")
    : names.length === 0 ? tx("Hi{name}! I'm Jo. Tap what you do and I'll set things up.", { name: studio.owner_first_name ? " " + String(studio.owner_first_name || "").split(" ")[0] : "" })
    : names.length === 1 ? tx("Nice, a {what}! I'll get your packages ready.", { what: tx(names[0]).toLowerCase() })
    : tx("Ooh, {n} hats! I'll set up packages for each.", { n: names.length });

  const toggle = (n) => setPicked((s) => { const x = new Set(s); x.has(n) ? x.delete(n) : x.add(n); return x; });
  const finish = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await updateStudio({ careers: names, name: f.name.trim() || studio.name, owner_first_name: f.owner_first_name.trim(), home_currency: f.home_currency, onboarded: true });
      toast(tx("Your studio is ready"), true);
    } catch (x) { toast(x.message); setBusy(false); }
  };

  return (
    <main className="onb">
      <div className="onb-card">
        <div className="onb-steps" aria-hidden="true"><i className="on" /><i className={step >= 1 ? "on" : ""} /><i className={step >= 2 ? "on" : ""} /></div>
        <div className="onb-jo"><Jo mood={step === 1 && !names.length ? "think" : "hello"} size={96} /><p className="bub jo" aria-live="polite">{joSays}</p></div>
        {step === 0 ? (
          <>
            <div><h1 className="h-xl">{tx("Choose your language")}</h1><p className="sub" style={{ marginTop: 6 }}>{tx("We'll set your currency to match. You can change both later in Settings.")}</p></div>
            <div className="careers">
              {LANGS.map(([k, n]) => (
                <button key={k} type="button" className="career" aria-pressed={lang === k} onClick={() => pickLang(k)}><span aria-hidden="true" style={{ fontSize: 13, fontWeight: 700 }}>{HELLO[k]}</span>{n}</button>
              ))}
            </div>
            <p className="sub" style={{ fontSize: 14 }}>{tx("Currency: {cur}", { cur: `${f.home_currency} (${SYM[f.home_currency]})` })}</p>
            <button type="button" className="btn btn-primary" style={{ minHeight: 52 }} onClick={() => { if (!studio.language) pickLang(lang); setStep(1); }}>{tx("Continue")}</button>
          </>
        ) : step === 1 ? (
          <>
            <div><h1 className="h-xl">{tx("What do you do?")}</h1><p className="sub" style={{ marginTop: 6 }}>{tx("Pick all that fit.")}</p></div>
            <div className="careers">
              {CAREERS.map(([emoji, label]) => (
                <button key={label} type="button" className="career" aria-pressed={picked.has(label)} onClick={() => toggle(label)}><span aria-hidden="true">{emoji}</span>{tx(label)}</button>
              ))}
            </div>
            <button type="button" className="btn btn-primary" style={{ minHeight: 52 }} disabled={!names.length} onClick={() => setStep(2)}>{names.length ? tx("Continue") : tx("Pick at least one")}</button>
            <button type="button" className="btn btn-ghost" onClick={() => setStep(0)}>{tx("Back")}</button>
          </>
        ) : (
          <form onSubmit={finish} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <h1 className="h-xl">{tx("Your studio")}</h1>
            <div className="field"><label htmlFor="o-name">{tx("Studio name")}</label><input id="o-name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder={tx("e.g. SmithLine Photography")} required /></div>
            <div className="field"><label htmlFor="o-first">{tx("Your full name")}</label><input id="o-first" value={f.owner_first_name} onChange={(e) => setF({ ...f, owner_first_name: e.target.value })} /></div>
            <div className="field"><label htmlFor="o-cur">{tx("Home currency")}</label>
              <select id="o-cur" value={f.home_currency} onChange={(e) => setF({ ...f, home_currency: e.target.value })}>{CURRENCIES.map((c) => <option key={c} value={c}>{c} ({SYM[c]})</option>)}</select></div>
            <div style={{ display: "flex", gap: 10 }}>
              <button type="button" className="btn btn-secondary" onClick={() => setStep(1)}>{tx("Back")}</button>
              <button className="btn btn-primary" style={{ flex: 1 }} disabled={busy}>{busy ? tx("Setting up…") : tx("Open my studio")}</button>
            </div>
          </form>
        )}
      </div>
    </main>
  );
}
