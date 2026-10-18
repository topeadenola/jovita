import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useData } from "../lib/data";
import { supabase } from "../supabase";
import Icon from "../components/Icon";
import { Toggle, useToast } from "../components/ui";
import { AskIcon } from "../components/Jo";
import { CURRENCIES, SYM, langPatch, money } from "../lib/format";
import { LANGS, tx } from "../lib/i18n";
import { useLang } from "../components/Lang";
import { draftNudge, draftReply, LENGTH, WARMTH } from "../lib/voice";
import { applyTheme, getSaved } from "../lib/theme";
import { SaveState, useAutosave } from "../lib/autosave";
import Templates from "./Templates";
import { LogoUploader } from "../components/StudioLogo";
import { guardLeave } from "../lib/unsaved";
import PaymentAccounts from "../components/PaymentAccounts";
import { PlanTab } from "../components/Upgrade";
import { useUi } from "../components/Shell";
import { GoogleCard } from "./Bookings";

// Everything you set once lives here, so the side menu stays for daily work.
const TABS = [
  ["studio", "Your studio", "users"],
  ["jovita", "Jovita", "chat"],
  ["templates", "Templates", "file"],
  ["connections", "Connections", "link"],
  ["reminders", "Reminders", "clock"],
  ["payments", "Payments", "wallet"],
  ["plan", "Plan", "star"],
  ["appearance", "Appearance", "eye"],
  ["account", "Account", "settings"],
];

function StudioTab() {
  const { studio, updateStudio } = useData();
  const { change } = useLang();
  const toast = useToast();
  const [f, setF, status] = useAutosave(
    { name: studio.name, owner_first_name: studio.owner_first_name, home_currency: studio.home_currency, bank_details: studio.bank_details },
    (v) => updateStudio(v),
  );
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  return (
    <section className="card set-card">
      <div className="set-head"><h2 className="h-m">{tx("Your studio")}</h2><SaveState status={status} /></div>
      <p className="sub">{tx("Your brand shows on every client link, invoice, contract and email. Changes save as you type.")}</p>
      <LogoUploader />
      <div className="form-grid">
        <div className="field"><label htmlFor="st-name">{tx("Studio name")}</label><input id="st-name" value={f.name} onChange={set("name")} /></div>
        <div className="field"><label htmlFor="st-owner">{tx("Your full name")}</label><input id="st-owner" value={f.owner_first_name} onChange={set("owner_first_name")} /></div>
      </div>
      <div className="field"><label htmlFor="st-cur">{tx("Home currency")}</label>
        <select id="st-cur" value={f.home_currency} onChange={set("home_currency")}>{CURRENCIES.map((c) => <option key={c} value={c}>{c} ({SYM[c]})</option>)}</select>
        <span className="help">{tx("Totals show in this currency. Invoices can use naira, pounds, dollars, euros or CFA francs.")}</span></div>
      <div className="field"><label htmlFor="st-lang">{tx("App language")}</label>
        <select id="st-lang" value={studio.language || ""} onChange={async (e) => { const l = e.target.value; try { const p = langPatch(studio, l); await updateStudio(p); if (p.home_currency) setF((x) => ({ ...x, home_currency: p.home_currency })); change(l, { persist: !!l }); if (p.home_currency) setTimeout(() => toast(tx("Home currency changed to {cur} to match. Change it below if you need to.", { cur: p.home_currency })), 60); } catch (x) { toast(x.message); } }}>
          <option value="">{tx("Automatic (from your location and phone)")}</option>
          {LANGS.map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select>
        <span className="help">{tx("Your clients see their portal in their own language.")}</span></div>
      <div className="field"><label htmlFor="st-bank">{tx("Bank transfer details")}</label>
        <textarea id="st-bank" value={f.bank_details} onChange={set("bank_details")} placeholder={tx("Bank: [Your bank]\nAccount name: [Name]\nAccount number: [0000000000]")} />
        <span className="help">{tx("Clients see this in their portal when they choose bank transfer.")}</span></div>
    </section>
  );
}

function JovitaTab() {
  const { studio, updateStudio } = useData();
  const toast = useToast();
  const [tone, setTone] = useState({ w: studio.tone_warmth ?? 2, l: studio.tone_length ?? 1 });
  const save = async (next) => { setTone(next); try { await updateStudio({ tone_warmth: next.w, tone_length: next.l }); } catch (x) { toast(x.message); } };
  const sample = draftNudge({ name: "Tara", amount: money(1400000, studio.home_currency), label: tx("newborn session"), late: 2, warmth: tone.w, length: tone.l, signer: studio.owner_first_name });
  const reply = draftReply({ name: "Priya", warmth: tone.w, length: tone.l, signer: studio.owner_first_name });
  return (
    <>
      <section className="card set-card">
        <div className="set-head"><div style={{ display: "flex", alignItems: "center", gap: 10 }}><AskIcon state="smile" className="set-ask" /><h2 className="h-m">{tx("Train your Jovita")}</h2></div></div>
        <p className="sub">{tx("How your reminders and replies sound. Ask Jovita writes in this voice everywhere.")}</p>
        <label className="tone"><span className="ends"><span>{tx("Formal")}</span><span>{tx(WARMTH[tone.w])}</span><span>{tx("Friendly")}</span></span>
          <input type="range" min="0" max="2" step="1" value={tone.w} onChange={(e) => save({ ...tone, w: +e.target.value })} aria-valuetext={tx(WARMTH[tone.w])} aria-label={tx("Tone")} /></label>
        <label className="tone"><span className="ends"><span>{tx("Short")}</span><span>{tx(LENGTH[tone.l])}</span><span>{tx("Detailed")}</span></span>
          <input type="range" min="0" max="2" step="1" value={tone.l} onChange={(e) => save({ ...tone, l: +e.target.value })} aria-valuetext={tx(LENGTH[tone.l])} aria-label={tx("Length")} /></label>
        <div className="grid g-2">
          <div className="sample-nudge" aria-live="polite"><small>{tx("Payment reminder")}</small><span style={{ whiteSpace: "pre-line" }}>{sample}</span></div>
          <div className="sample-nudge" aria-live="polite"><small>{tx("Reply to a new enquiry")}</small><span style={{ whiteSpace: "pre-line" }}>{reply}</span></div>
        </div>
      </section>
      <JovitaMemory />
      <section className="card set-card">
        <h2 className="h-m">{tx("Ask Jovita")}</h2>
        <p className="sub">{tx("Tap the Ask Jovita button on any page. It answers from your own clients, projects, money, galleries and bookings, and drafts messages for you to send.")}</p>
        <div className="switch"><div><b>{tx("Only acts when you ask")}</b><span>{tx("Jovita never sends a message or touches money on its own. You always tap send.")}</span></div><span className="pill p-success">{tx("Always on")}</span></div>
      </section>
    </>
  );
}

// What Jovita should always know: packages, policies, how you like to work. Saved as short notes it reads before every answer.
function JovitaMemory() {
  const toast = useToast();
  const [items, setItems] = useState(null);
  const [text, setText] = useState("");
  const load = async () => { const { data, error } = await supabase.from("jovita_memory").select("id,fact,created_at").order("created_at"); setItems(error ? [] : data || []); };
  useEffect(() => { load(); }, []);
  const add = async (e) => {
    e.preventDefault();
    const fact = text.trim();
    if (!fact) return;
    const { error } = await supabase.from("jovita_memory").insert({ fact: fact.slice(0, 300) });
    if (error) return toast(error.message);
    setText(""); load(); toast(tx("Jovita will remember that"), true);
  };
  const del = async (id) => { await supabase.from("jovita_memory").delete().eq("id", id); load(); };
  const EXAMPLES = [tx("My wedding package is ₦850,000 for 8 hours with 2 photographers."), tx("I ask for a 50% deposit to lock in a date."), tx("Galleries are delivered within 3 weeks."), tx("I sign off as Tope.")];
  return (
    <section className="card set-card">
      <h2 className="h-m">{tx("What Jovita knows about your studio")}</h2>
      <p className="sub">{tx("Teach Jovita your prices, packages, policies and how you like to work. It reads these notes before every answer, and only you can see them. You can also just tell Jovita in a chat: \"Remember that I don't shoot on Sundays.\"")}</p>
      <form onSubmit={add} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div className="field"><label htmlFor="jm-new">{tx("Add something Jovita should know")}</label>
          <textarea id="jm-new" rows={2} maxLength={300} value={text} onChange={(e) => setText(e.target.value)} placeholder={EXAMPLES[0]} />
          <span className="help">{text.length}/300</span></div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="btn btn-primary btn-sm" disabled={!text.trim()}><Icon name="plus" />{tx("Teach Jovita")}</button>
          {EXAMPLES.slice(1).map((ex) => <button key={ex} type="button" className="chip" onClick={() => setText(ex)}>{ex}</button>)}
        </div>
      </form>
      {items === null ? <p className="sub">{tx("Loading…")}</p> : items.length ? (
        <ul className="jm-list">{items.map((m) => (
          <li key={m.id}><span>{m.fact}</span><button type="button" className="btn btn-ghost btn-sm" onClick={() => del(m.id)} aria-label={tx("Forget this")}>{tx("Forget")}</button></li>
        ))}</ul>
      ) : <p className="sub" style={{ fontSize: 13 }}>{tx("Nothing yet. Add your packages and deposit policy first, they help the most.")}</p>}
    </section>
  );
}

function RemindersTab() {
  const { studio, updateStudio } = useData();
  const toast = useToast();
  const tog = async (k, v, label) => { try { await updateStudio({ [k]: v }); toast(v ? tx("{label} on", { label }) : tx("{label} off", { label })); } catch (e) { toast(e.message); } };
  return (
    <section className="card set-card">
      <h2 className="h-m">{tx("Reminders and messages")}</h2>
      {[["reminders_on", tx("Automatic invoice reminders"), tx("On by default, so you never have to chase")], ["remind_before", tx("Before it's due"), tx("A friendly heads-up")], ["remind_after", tx("When it's overdue"), tx("Then on the days set on each invoice until paid")], ["copy_me", tx("Send me a copy"), tx("Get a copy of every invoice, quote, reminder and contract email Jovita sends your clients")]].map(([k, n, d]) => (
        <div className="switch" key={k}><div><b>{n}</b><span>{d}</span></div><Toggle on={studio[k]} label={n} onChange={(v) => tog(k, v, n)} /></div>
      ))}
      <p className="sub" style={{ fontSize: 13 }}>{tx("Each invoice can also switch its own reminders on or off, and pick which days they go out.")}</p>
    </section>
  );
}

// Email and calendar. Anyone can connect their own: email works the moment you sign up, Google Calendar is one click.
function ConnectionsTab() {
  const { studio, session, updateStudio } = useData();
  const toast = useToast();
  const [reply, setReply] = useState(studio.reply_email || "");
  const saveReply = async () => {
    const v = reply.trim();
    if (v && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) return toast(tx("That email doesn't look right."));
    if (v === (studio.reply_email || "")) return;
    try { await updateStudio({ reply_email: v || null }); toast(tx("Saved. Client replies now go to {email}", { email: v || session.user.email }), true); } catch (e) { toast(e.message); }
  };
  return (
    <>
      <section className="card set-card">
        <div className="set-head"><h2 className="h-m">{tx("Email")}</h2><span className="pill p-success">{tx("Connected")}</span></div>
        <p className="sub">{tx("Invoices, quotes, contracts, reminders and galleries are emailed to your clients from \"{studio} via Jovita\". When a client replies, it lands in your own inbox.", { studio: studio.name || tx("Your studio") })}</p>
        <div className="field"><label htmlFor="cn-reply">{tx("Client replies go to")}</label>
          <input id="cn-reply" type="email" value={reply} onChange={(e) => setReply(e.target.value)} onBlur={saveReply} onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }} placeholder={session.user.email} />
          <span className="help">{tx("Leave empty to use your sign-in email. Use your studio's email, e.g. hello@yourstudio.com.")}</span></div>
        <div className="switch"><div><b>{tx("Send me a copy")}</b><span>{tx("A copy of every email Jovita sends your clients, so you always have a record.")}</span></div>
          <Toggle on={!!studio.copy_me} label={tx("Send me a copy")} onChange={async (v) => { try { await updateStudio({ copy_me: v }); toast(v ? tx("You'll get a copy of client emails") : tx("Copies off")); } catch (e) { toast(e.message); } }} /></div>
        <p className="sub" style={{ fontSize: 13 }}><a href="https://getjovita.com/help/#connect-email" target="_blank" rel="noreferrer">{tx("How email works in Jovita")}</a></p>
      </section>
      <GoogleCard />
      <section className="card set-card">
        <div className="set-head"><h2 className="h-m">{tx("WhatsApp")}</h2><span className="pill p-neutral">{tx("Coming soon")}</span></div>
        <p className="sub" style={{ fontSize: 13 }}>{tx("WhatsApp messages in your Jovita inbox are coming in a future update.")}</p>
      </section>
    </>
  );
}

function PaymentsTab() {
  return <PaymentAccounts />;
}

function AppearanceTab() {
  const { studio, updateStudio } = useData();
  const toast = useToast();
  const [mode, setMode] = useState(studio.theme || getSaved());
  const pick = async (m) => { setMode(m); applyTheme(m); try { await updateStudio({ theme: m }); } catch (x) { toast(x.message); } };
  return (
    <section className="card set-card">
      <h2 className="h-m">{tx("Appearance")}</h2>
      <div className="seg" role="group" aria-label={tx("Appearance")}>
        {[["light", "Bright"], ["dark", "Dark"], ["auto", "Automatic"]].map(([k, n]) => <button key={k} type="button" aria-pressed={mode === k} onClick={() => pick(k)}>{tx(n)}</button>)}
      </div>
      <p className="sub" style={{ fontSize: 13 }}>{tx("Automatic follows your phone or computer. Your choice follows you to the phone app.")}</p>
    </section>
  );
}

function AccountTab() {
  const { session } = useData();
  return (
    <section className="card set-card">
      <h2 className="h-m">{tx("Account")}</h2>
      <p className="sub">{tx("Signed in as")}{" "}<b style={{ color: "var(--ink)" }}>{session.user.email}</b></p>
      <p className="sub" style={{ fontSize: 13 }}>{tx("Use the same email and password on the web app and the phone app.")}</p>
    </section>
  );
}

export default function Settings() {
  const [params, setParams] = useSearchParams();
  const ui = useUi();
  const tab = TABS.some((t) => t[0] === params.get("tab")) ? params.get("tab") : "studio";
  const go = (t) => guardLeave(() => setParams(t === "studio" ? {} : { tab: t }, { replace: true }));
  useEffect(() => { window.scrollTo(0, 0); }, [tab]);
  return (
    <>
      <div className="head"><div><p className="eyebrow">{tx("Settings")}</p><h1 className="h-l">{tx("Set it once")}</h1></div></div>
      <div className="set-layout">
        <nav className="set-nav" aria-label={tx("Settings")}>
          {TABS.map(([k, label, icon]) => (
            <button key={k} type="button" aria-current={tab === k ? "page" : undefined} onClick={() => go(k)}><Icon name={icon} />{tx(label)}{k === "plan" && ui?.plan?.plan === "free" && <span className="tab-up">{tx("Upgrade")}</span>}</button>
          ))}
        </nav>
        <div className="set-body">
          {tab === "studio" && <StudioTab />}
          {tab === "jovita" && <JovitaTab />}
          {tab === "templates" && <Templates embedded />}
          {tab === "connections" && <ConnectionsTab />}
          {tab === "reminders" && <RemindersTab />}
          {tab === "payments" && <PaymentsTab />}
          {tab === "plan" && ui?.plan && <PlanTab plan={ui.plan} onPlan={ui.setPlan} />}
          {tab === "appearance" && <AppearanceTab />}
          {tab === "account" && <AccountTab />}
        </div>
      </div>
    </>
  );
}
