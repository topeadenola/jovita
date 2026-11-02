import { useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../supabase";
import Icon, { Mark } from "../components/Icon";
import { tx } from "../lib/i18n";
import { LangSwitch } from "../components/Lang";
import Turnstile, { TURNSTILE_SITE_KEY } from "../components/Turnstile";

// After 5 wrong passwords, this browser waits 15 minutes before trying again (Supabase also limits attempts per network)
const LOCK_KEY = "jv-signin-fails";
const MAX_FAILS = 5, LOCK_MIN = 15;
const readFails = () => { try { return JSON.parse(localStorage.getItem(LOCK_KEY) || "{}"); } catch { return {}; } };
const writeFails = (v) => { try { localStorage.setItem(LOCK_KEY, JSON.stringify(v)); } catch { /* private mode */ } };
const lockedFor = (email) => { const r = readFails()[email]; return r?.until && r.until > Date.now() ? Math.ceil((r.until - Date.now()) / 60000) : 0; };
function noteFail(email) {
  const all = readFails(), r = all[email] && all[email].since > Date.now() - LOCK_MIN * 60000 ? all[email] : { n: 0, since: Date.now() };
  r.n += 1; if (r.n >= MAX_FAILS) { r.until = Date.now() + LOCK_MIN * 60000; r.n = 0; r.since = Date.now(); }
  all[email] = r; writeFails(all); return r.until && r.until > Date.now() ? LOCK_MIN : MAX_FAILS - r.n;
}
const clearFails = (email) => { const all = readFails(); delete all[email]; writeFails(all); };

export default function Auth({ initial = "signup" }) {
  const [mode, setMode] = useState(() => (typeof location !== "undefined" && /[?&]reset=1/.test(location.search) ? "reset" : initial));
  const [f, setF] = useState({ first: "", studio: "", email: "", password: "" });
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const [captcha, setCaptcha] = useState("");
  const human = useRef(null);
  const needCaptcha = !!TURNSTILE_SITE_KEY && !captcha;

  async function submit(e) {
    e.preventDefault();
    if (needCaptcha) { setMsg({ ok: false, text: tx("Please complete the quick check above the button.") }); return; }
    const email = f.email.trim().toLowerCase();
    const wait = mode === "signin" ? lockedFor(email) : 0;
    if (wait) { setMsg({ ok: false, text: tx("Too many wrong passwords. Try again in {n} minutes, or reset your password.", { n: wait }) }); return; }
    const captchaToken = captcha || undefined;
    setBusy(true); setMsg(null);
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email: f.email, password: f.password,
          options: { data: { first_name: f.first, studio_name: f.studio }, emailRedirectTo: window.location.origin, captchaToken },
        });
        if (error) throw error;
        if (!data.session) {
          // Testing mode confirms accounts instantly, so sign straight in
          const { error: e2 } = await supabase.auth.signInWithPassword({ email: f.email, password: f.password });
          if (e2) setMsg({ ok: true, text: tx("Check your email to confirm your account, then sign in.") });
        }
      } else if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email: f.email, password: f.password, options: { captchaToken } });
        if (error) {
          if (/invalid login credentials/i.test(error.message)) {
            const left = noteFail(email);
            throw new Error(lockedFor(email) ? tx("Too many wrong passwords. Try again in {n} minutes, or reset your password.", { n: left }) : left <= 2 ? tx("Wrong email or password. {n} tries left before a 15-minute pause.", { n: left }) : tx("Wrong email or password."));
          }
          throw error;
        }
        clearFails(email);
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(f.email, { redirectTo: `${window.location.origin}/reset-password`, captchaToken });
        if (error) throw error;
        setMsg({ ok: true, text: tx("We've emailed you a link to reset your password.") });
      }
    } catch (err) {
      setMsg({ ok: false, text: err.message });
    } finally {
      setBusy(false);
      human.current?.reset(); // each check works once
    }
  }

  return (
    <div className="auth">
      <section className="auth-side">
        <Link to="/" className="brand" style={{ textDecoration: "none" }}><Mark dot="#261433" smile="#261433" style={{ width: 30, height: 42 }} /><b>jovita</b></Link>
        <LangSwitch />
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <h1>{tx("Run your creative business with joy.")}</h1>
          <p>{tx(
            "Clients, bookings, contracts, invoices and galleries in one friendly place. Built for photographers, videographers, makeup artists, stylists and designers."
          )}</p>
        </div>
        <p style={{ fontSize: 13 }}>{tx("Naira, pounds and dollars. Paystack, Stripe and bank transfer.")}</p>
      </section>
      <main className="auth-main">
        <form className="auth-card" onSubmit={submit}>
          <h2 className="h-l">{mode === "signup" ? tx("Create your studio") : mode === "signin" ? tx("Welcome back") : tx("Reset your password")}</h2>
          {mode === "signup" && (
            <div className="form-grid">
              <div className="field"><label htmlFor="a-first">{tx("Your first name")}</label><input id="a-first" required value={f.first} onChange={set("first")} placeholder={tx("Tope")} /></div>
              <div className="field"><label htmlFor="a-studio">{tx("Studio name")}</label><input id="a-studio" required value={f.studio} onChange={set("studio")} placeholder={tx("HorploadWorks")} /></div>
            </div>
          )}
          <div className="field"><label htmlFor="a-email">{tx("Email")}</label><input id="a-email" type="email" required value={f.email} onChange={set("email")} autoComplete="email" /></div>
          {mode !== "reset" && (
            <div className="field"><label htmlFor="a-pass">{tx("Password")}</label><div className="pw-field"><input id="a-pass" type={showPw ? "text" : "password"} required minLength={8} value={f.password} onChange={set("password")} autoComplete={mode === "signup" ? "new-password" : "current-password"} /><button type="button" className="pw-eye" onClick={() => setShowPw((v) => !v)} aria-label={showPw ? tx("Hide password") : tx("Show password")} aria-pressed={showPw}><Icon name={showPw ? "eyeoff" : "eye"} /></button></div><span className="help">{tx("At least 8 characters.")}</span></div>
          )}
          <Turnstile ref={human} onToken={setCaptcha} />
          {msg && <p className={msg.ok ? "sub" : "err"} role="status">{msg.text}</p>}
          <button className="btn btn-primary" disabled={busy} type="submit">
            {busy ? tx("One moment…") : mode === "signup" ? tx("Create my studio") : mode === "signin" ? tx("Sign in") : tx("Send reset link")}
          </button>
          <p className="sub" style={{ fontSize: 14 }}>
            {mode === "signup" ? <>{tx("Already have a studio?")}{" "}<button type="button" className="btn btn-ghost btn-sm" onClick={() => setMode("signin")}>{tx("Sign in")}</button></>
              : <>{tx("New to Jovita?")}{" "}<button type="button" className="btn btn-ghost btn-sm" onClick={() => setMode("signup")}>{tx("Create a studio")}</button></>}
            {mode === "signin" && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setMode("reset")}>{tx("Forgot password?")}</button>}
          </p>
        </form>
      </main>
    </div>
  );
}

// Opened from the "reset your password" email: the link signs the person in for a few minutes so they can choose a new password.
export function NewPassword({ session }) {
  const nav = useNavigate();
  const [pw, setPw] = useState({ a: "", b: "" });
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  async function save(e) {
    e.preventDefault();
    if (pw.a !== pw.b) { setMsg({ ok: false, text: tx("The two passwords don't match.") }); return; }
    setBusy(true); setMsg(null);
    const { error } = await supabase.auth.updateUser({ password: pw.a });
    setBusy(false);
    if (error) { setMsg({ ok: false, text: error.message }); return; }
    setMsg({ ok: true, text: tx("Your new password is saved. Taking you to your studio…") });
    setTimeout(() => nav("/", { replace: true }), 1500);
  }
  return (
    <div className="auth">
      <section className="auth-side">
        <Link to="/" className="brand" style={{ textDecoration: "none" }}><Mark dot="#261433" smile="#261433" style={{ width: 30, height: 42 }} /><b>jovita</b></Link>
        <LangSwitch />
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}><h1>{tx("Run your creative business with joy.")}</h1></div>
        <span />
      </section>
      <main className="auth-main">
        {session === undefined ? <div className="loading">{tx("Loading…")}</div> : !session ? (
          <div className="auth-card">
            <h2 className="h-l">{tx("This reset link has expired")}</h2>
            <p className="sub">{tx("Reset links work once and only for a short time. Ask for a new one and use it straight away.")}</p>
            <Link className="btn btn-primary" to="/login?reset=1">{tx("Send me a new link")}</Link>
          </div>
        ) : (
          <form className="auth-card" onSubmit={save}>
            <h2 className="h-l">{tx("Choose a new password")}</h2>
            <p className="sub">{session.user?.email}</p>
            <div className="field"><label htmlFor="np-a">{tx("New password")}</label><div className="pw-field"><input id="np-a" type={show ? "text" : "password"} required minLength={8} autoFocus value={pw.a} onChange={(e) => setPw({ ...pw, a: e.target.value })} autoComplete="new-password" /><button type="button" className="pw-eye" onClick={() => setShow((v) => !v)} aria-label={show ? tx("Hide password") : tx("Show password")} aria-pressed={show}><Icon name={show ? "eyeoff" : "eye"} /></button></div><span className="help">{tx("At least 8 characters.")}</span></div>
            <div className="field"><label htmlFor="np-b">{tx("Type it again")}</label><input id="np-b" type={show ? "text" : "password"} required minLength={8} value={pw.b} onChange={(e) => setPw({ ...pw, b: e.target.value })} autoComplete="new-password" /></div>
            {msg && <p className={msg.ok ? "sub" : "err"} role="status">{msg.text}</p>}
            <button className="btn btn-primary" disabled={busy} type="submit">{busy ? tx("One moment…") : tx("Save new password")}</button>
          </form>
        )}
      </main>
    </div>
  );
}
