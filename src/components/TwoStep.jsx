// Two-step sign-in (an authenticator app code after the password), using Supabase MFA.
// TwoStepCard: Settings › Account, to turn it on or off. TwoStepGate: asks for the code after signing in.
import { useEffect, useRef, useState } from "react";
import { supabase } from "../supabase";
import { tx } from "../lib/i18n";
import { useToast } from "./ui";
import Icon, { Mark } from "./Icon";

const clean = (v) => v.replace(/\D/g, "").slice(0, 6);

// Does this account need the code right now?
export async function needsCode() {
  try {
    const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    return data?.nextLevel === "aal2" && data?.currentLevel !== "aal2";
  } catch { return false; }
}

function CodeInput({ value, onChange, autoFocus }) {
  return (
    <input className="code-input" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required
      aria-label={tx("6-digit code")} placeholder="123456" autoFocus={autoFocus} value={value} onChange={(e) => onChange(clean(e.target.value))} />
  );
}

export function TwoStepGate({ onDone }) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setErr("");
    try {
      const { data } = await supabase.auth.mfa.listFactors();
      const f = data?.totp?.find((x) => x.status === "verified");
      if (!f) { onDone(); return; }
      const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: f.id, code });
      if (error) throw error;
      onDone();
    } catch { setErr(tx("That code didn't work. Check your authenticator app and try the newest code.")); setCode(""); }
    setBusy(false);
  };
  return (
    <div className="auth">
      <section className="auth-side">
        <span className="brand"><Mark dot="#261433" smile="#261433" style={{ width: 30, height: 42 }} /><b>jovita</b></span>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <h1>{tx("One more step.")}</h1>
          <p>{tx("Your studio is protected with two-step sign-in, so only you can get in.")}</p>
        </div>
        <span />
      </section>
      <main className="auth-main">
        <form className="auth-card" onSubmit={submit}>
          <h2 className="h-l">{tx("Enter your code")}</h2>
          <p className="sub">{tx("Open your authenticator app and type the 6-digit code for Jovita.")}</p>
          <div className="field"><CodeInput value={code} onChange={setCode} autoFocus /></div>
          {err && <p className="err" role="status">{err}</p>}
          <button className="btn btn-primary" disabled={busy || code.length !== 6}>{busy ? tx("One moment…") : tx("Continue")}</button>
          <p className="sub" style={{ fontSize: 14 }}>{tx("Lost your phone? Email hello@getjovita.com from your account email and we'll help.")}{" "}
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => supabase.auth.signOut()}>{tx("Sign out")}</button></p>
        </form>
      </main>
    </div>
  );
}

export function TwoStepCard() {
  const toast = useToast();
  const [factor, setFactor] = useState(undefined); // verified factor, null if off
  const [setup, setSetup] = useState(null); // { id, qr, secret } while turning it on
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmOff, setConfirmOff] = useState(false);
  const live = useRef(true);
  const load = async () => {
    const { data } = await supabase.auth.mfa.listFactors();
    if (live.current) setFactor(data?.totp?.find((x) => x.status === "verified") || null);
  };
  useEffect(() => { live.current = true; load(); return () => { live.current = false; }; }, []);

  const start = async () => {
    setBusy(true);
    try {
      // clear any half-finished setup first
      const { data } = await supabase.auth.mfa.listFactors();
      for (const f of data?.all || []) if (f.status !== "verified") await supabase.auth.mfa.unenroll({ factorId: f.id });
      const { data: en, error } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: "Jovita " + new Date().toISOString().slice(0, 10) });
      if (error) throw error;
      setSetup({ id: en.id, qr: en.totp.qr_code, secret: en.totp.secret });
    } catch (e) { toast(tx("That didn't work: {err}", { err: e.message })); }
    setBusy(false);
  };
  const confirm = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: setup.id, code });
      if (error) throw error;
      setSetup(null); setCode("");
      toast(tx("Two-step sign-in is on. You'll need a code each time you sign in."), true);
      await load();
    } catch { toast(tx("That code didn't work. Try the newest code in your app.")); setCode(""); }
    setBusy(false);
  };
  const turnOff = async () => {
    setBusy(true);
    try {
      const { error } = await supabase.auth.mfa.unenroll({ factorId: factor.id });
      if (error) throw error;
      await supabase.auth.refreshSession();
      toast(tx("Two-step sign-in is off."), true);
      setConfirmOff(false);
      await load();
    } catch (e) { toast(tx("That didn't work: {err}", { err: e.message })); }
    setBusy(false);
  };

  return (
    <section className="card set-card">
      <div className="set-head"><h2 className="h-m">{tx("Two-step sign-in")}</h2>{factor && <span className="pill p-good">{tx("On")}</span>}</div>
      <p className="sub">{tx("After your password, Jovita asks for a 6-digit code from an authenticator app on your phone (Google Authenticator, Microsoft Authenticator or 1Password). Even if someone learns your password, they can't get in.")}</p>
      {factor === undefined ? null
        : factor ? (
          confirmOff ? (
            <div className="stack">
              <p className="sub"><b style={{ color: "var(--ink)" }}>{tx("Turn off two-step sign-in?")}</b> {tx("Your account will be protected by your password only.")}</p>
              <div style={{ display: "flex", gap: 10 }}><button type="button" className="btn btn-danger" disabled={busy} onClick={turnOff}>{busy ? tx("One moment…") : tx("Turn off")}</button><button type="button" className="btn btn-ghost" onClick={() => setConfirmOff(false)}>{tx("Keep it on")}</button></div>
            </div>
          ) : <p><button type="button" className="btn btn-secondary" onClick={() => setConfirmOff(true)}>{tx("Turn off two-step sign-in")}</button></p>
        ) : setup ? (
          <form className="twostep-setup" onSubmit={confirm}>
            <ol className="sub">
              <li>{tx("Open your authenticator app and add a new account.")}</li>
              <li>{tx("Scan this code with your phone's camera.")}</li>
              <li>{tx("Type the 6-digit code it shows.")}</li>
            </ol>
            <img className="twostep-qr" src={setup.qr} alt={tx("QR code to scan with your authenticator app")} width="180" height="180" />
            <p className="sub" style={{ fontSize: 13 }}>{tx("Can't scan? Type this key instead:")} <code className="twostep-key">{setup.secret}</code></p>
            <div className="field"><CodeInput value={code} onChange={setCode} autoFocus /></div>
            <div style={{ display: "flex", gap: 10 }}><button className="btn btn-primary" disabled={busy || code.length !== 6}>{busy ? tx("Checking…") : tx("Turn on")}</button><button type="button" className="btn btn-ghost" onClick={() => { supabase.auth.mfa.unenroll({ factorId: setup.id }); setSetup(null); }}>{tx("Cancel")}</button></div>
          </form>
        ) : <p><button type="button" className="btn btn-primary" disabled={busy} onClick={start}><Icon name="lock" />{busy ? tx("One moment…") : tx("Turn on two-step sign-in")}</button></p>}
    </section>
  );
}
