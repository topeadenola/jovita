import { useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../supabase";
import Icon, { Mark } from "../components/Icon";
import { tx } from "../lib/i18n";
import { LangSwitch } from "../components/Lang";

export default function Auth({ initial = "signup" }) {
  const [mode, setMode] = useState(initial);
  const [f, setF] = useState({ first: "", studio: "", email: "", password: "" });
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setMsg(null);
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email: f.email, password: f.password,
          options: { data: { first_name: f.first, studio_name: f.studio }, emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        if (!data.session) {
          // Testing mode confirms accounts instantly, so sign straight in
          const { error: e2 } = await supabase.auth.signInWithPassword({ email: f.email, password: f.password });
          if (e2) setMsg({ ok: true, text: tx("Check your email to confirm your account, then sign in.") });
        }
      } else if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email: f.email, password: f.password });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(f.email, { redirectTo: window.location.origin });
        if (error) throw error;
        setMsg({ ok: true, text: tx("We've emailed you a link to reset your password.") });
      }
    } catch (err) {
      setMsg({ ok: false, text: err.message });
    } finally {
      setBusy(false);
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
