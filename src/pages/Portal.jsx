import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "../supabase";
import StudioLogo from "../components/StudioLogo";
import Icon, { Mark } from "../components/Icon";
import { Pill, useToast } from "../components/ui";
import { fdate, fday, first, ftime, invState, money } from "../lib/format";
import { fill, values } from "../lib/merge";
import { tx } from "../lib/i18n";
import { LangSwitch } from "../components/Lang";
import { PROVIDERS, bankText } from "../lib/payments";
import { payFlutterwave, payPaystack, renderPayPal } from "../lib/checkout";

function SignBlock({ title, done, doneText, text, onSign, signLabel }) {
  const [name, setName] = useState("");
  const [ok, setOk] = useState(false);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const id = title.replace(/\W+/g, "-").toLowerCase();
  return (
    <section className="card" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}><h2 className="h-m">{title}</h2><Pill c={done ? "p-success" : "p-warning"}>{done ? tx("Signed") : tx("To do")}</Pill></div>
      {done ? <p className="sub">{doneText}</p> : (
        <>
          <div className="contract-text" style={{ whiteSpace: "pre-wrap", maxHeight: 260 }}>{text}</div>
          <div className="field"><label htmlFor={`${id}-name`}>{tx("Type your full name to sign")}</label><input id={`${id}-name`} value={name} onChange={(e) => setName(e.target.value)} /></div>
          <label className="check" htmlFor={`${id}-ok`}><input type="checkbox" id={`${id}-ok`} checked={ok} onChange={(e) => setOk(e.target.checked)} />{" "}{tx("I have read and agree to the above")}</label>
          {err && <p className="err">{err}</p>}
          <button className="btn btn-primary" style={{ alignSelf: "flex-start" }} disabled={busy} onClick={async () => {
            if (name.trim().length < 2) return setErr(tx("Type your full name to sign."));
            if (!ok) return setErr(tx("Tick the box to agree."));
            setBusy(true); setErr("");
            try { await onSign(name.trim()); } catch (e) { setErr(e.message); } finally { setBusy(false); }
          }}><Icon name="file" />{signLabel}</button>
        </>
      )}
    </section>
  );
}

function PayPalBox({ acct, inv, onPaid }) {
  const box = useRef(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    if (!acct || !box.current) return;
    renderPayPal({ key: acct.public_key, inv, el: box.current, onPaid, onError: setErr }).catch((e) => setErr(e.message));
  }, [acct, inv]); // eslint-disable-line react-hooks/exhaustive-deps
  return <div><div ref={box} style={{ maxWidth: 360 }} />{err && <p className="err">{err}</p>}</div>;
}

export default function Portal() {
  const { token } = useParams();
  const toast = useToast();
  const [d, setD] = useState(undefined);
  const [method, setMethod] = useState("");
  const [paying, setPaying] = useState(false);
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc("get_portal", { p_token: token });
    setD(error ? null : data);
  }, [token]);
  useEffect(() => { load(); }, [load]);

  if (d === undefined) return <div className="loading">{tx("Loading…")}</div>;
  if (!d) return <div className="loading"><div className="empty"><b style={{ color: "var(--ink)" }}>{tx("This link isn't working")}</b><p>{tx("Ask your photographer or creative to send you a fresh link.")}</p></div></div>;

  const { project: p, client: c, studio: s } = d;
  const vals = values({ studio: s, client: c, project: { ...p, portal_token: token } });
  const open = d.invoices.find((i) => i.status === "sent");
  // The studio's own switched-on accounts that can take this invoice's currency
  const accts = Array.isArray(d.payments) ? d.payments : [];
  const acct = (prov) => accts.find((a) => a.provider === prov);
  const banks = accts.filter((a) => a.provider === "bank" && (!open || !a.details?.currency || a.details.currency === open.currency));
  const canTake = (prov) => !open || !PROVIDERS[prov].currencies || PROVIDERS[prov].currencies.includes(open.currency);
  const methods = [
    ["pay_paystack", "Paystack", tx("Card, bank, USSD"), "paystack"], ["pay_flutterwave", "Flutterwave", tx("Card, mobile money, bank"), "flutterwave"],
    ["pay_paypal", "PayPal", tx("PayPal or card"), "paypal"], ["pay_stripe", tx("Card"), "Visa, Mastercard, Apple Pay", "stripe"], ["pay_transfer", tx("Bank transfer"), tx("Pay from your bank app"), "bank"],
  ].filter((m) => s[m[0]] && (m[3] === "bank" ? true : acct(m[3]) && canTake(m[3])) && (!open?.methods?.length || open.methods.includes(m[3] === "bank" ? "transfer" : m[3])));
  const chosen = methods.some((m) => m[0] === method) ? method : methods[0]?.[0];
  const reportPaid = async (prov, reference) => {
    const { error } = await supabase.rpc("portal_report_payment_v2", { p_token: token, p_invoice: open.id, p_method: prov, p_reference: String(reference || "") });
    if (error) await supabase.rpc("portal_report_payment", { p_token: token, p_invoice: open.id });
    toast(tx("Payment received. Thank you! {name} will confirm it shortly.", { name: s.name }), true);
    load();
  };
  const payOnline = async (prov) => {
    setPaying(true);
    try {
      const a = acct(prov);
      const args = { key: a.public_key, inv: open, email: c.email, name: c.name, title: s.name };
      const reference = prov === "paystack" ? await payPaystack(args) : await payFlutterwave(args);
      await reportPaid(prov, reference);
    } catch (e) { if (e.message !== "closed") toast(e.message); } finally { setPaying(false); }
  };
  const needsContract = !!d.contract;
  const allSet = (!needsContract || p.contract_signed) && !open;
  let step = 0;

  return (
    <div className="portal">
      <header className="portal-hero">
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}><StudioLogo studio={s} /><div style={{ flex: 1 }}><b>{s.name}</b><p className="sub" style={{ fontSize: 13 }}>{tx(p.type)} · {fday(p.session_date)}</p></div><LangSwitch compact /></div>
        <h1 className="h-xl" style={{ marginTop: 16 }}>{tx("Hi {name}, here's everything for your {title}.", { name: first(c.name), title: p.title.toLowerCase() })}</h1>
        <p className="sub">{allSet ? tx("You're all set. We can't wait to see you!") : tx("A couple of quick steps and your date is locked in.")}</p>
      </header>
      <div className="portal-body">
        <div style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>
          {needsContract && <SignBlock title={tx("{v0}. Sign your contract", {
            v0: ++step
          })} done={p.contract_signed} doneText={tx("Signed. Thank you!")} text={fill(d.contract, vals)} signLabel={tx("Sign contract")}
            onSign={async (name) => { const { error } = await supabase.rpc("portal_sign_contract", { p_token: token, p_name: name }); if (error) throw error; toast(tx("Contract signed. Thank you!"), true); load(); }} />}

          <section className="card" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}><h2 className="h-m">{++step}. {open ? tx("Pay {v0}", {
              v0: open.label.toLowerCase()
            }) : tx("Payments")}</h2>
              {open ? <Pill c={invState(open).c}>{invState(open).k}</Pill> : d.invoices.length ? <Pill c="p-success">{tx("Paid")}</Pill> : <Pill c="p-neutral">{tx("Nothing due")}</Pill>}</div>
            {open ? (
              <>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}><span className="sub">{tx("Invoice #")}{open.number}{" "}{tx("· due")}{" "}{fdate(open.due_date)}</span><span className="num" style={{ fontFamily: "var(--font-display)", fontSize: 30, fontWeight: 700 }}>{money(open.amount, open.currency)}</span></div>
                {Array.isArray(open.items) && open.items.some((it) => it.name || it.description) && (
                  <ul className="portal-items">{open.items.filter((it) => it.name || it.description).map((it, i) => (
                    <li key={it.id || i}><div><b>{it.name}</b>{it.description && <p>{it.description}</p>}</div><span className="num">{money(Number(it.qty || 1) * Number(it.price || 0), open.currency)}</span></li>
                  ))}</ul>
                )}
                {open.payment_reported_at ? <p className="sub">{tx("Thanks! You told us you've paid.")}{" "}{s.name}{" "}{tx("will confirm shortly.")}</p> : (
                  <>
                    <div className="pay-opts" role="group" aria-label={tx("Payment method")}>{methods.map((m) => <button key={m[0]} className="pay-opt" aria-pressed={chosen === m[0]} onClick={() => setMethod(m[0])}><b>{m[1]}</b><span>{m[2]}</span></button>)}</div>
                    {chosen === "pay_transfer" ? (
                      <>
                        <div className="contract-text" style={{ whiteSpace: "pre-wrap" }}>{(banks.length ? banks.map((a) => bankText(a.details)).join("\n\n") : "") || s.bank_details || tx("{name} will share their bank details with you.", {
                          name: s.name
                        })}{tx("\nReference: Invoice {number}", {
                          number: open.number
                        })}</div>
                        <button className="btn btn-joy" style={{ alignSelf: "flex-start" }} onClick={async () => { const { error } = await supabase.rpc("portal_report_payment", { p_token: token, p_invoice: open.id }); if (error) return toast(error.message); toast(tx("Thanks! We've let them know."), true); load(); }}>{tx("I've made the transfer")}</button>
                      </>
                    ) : chosen === "pay_paypal" ? <PayPalBox key={open.id} acct={acct("paypal")} inv={open} onPaid={(r) => reportPaid("paypal", r)} />
                      : chosen === "pay_stripe" ? <p className="sub" style={{ fontSize: 13 }}>{tx("Card payments by Stripe are being set up. Please choose another way to pay for now.")}</p>
                      : <button className="btn btn-joy" style={{ alignSelf: "flex-start" }} disabled={paying} onClick={() => payOnline(chosen === "pay_paystack" ? "paystack" : "flutterwave")}>{paying ? tx("Opening…") : tx("Pay {amount} now", { amount: money(open.amount, open.currency) })}</button>}
                  </>
                )}
              </>
            ) : <p className="sub">{d.invoices.length ? tx("All paid. Thank you!") : tx("No payment due right now.")}</p>}
          </section>

          {d.release && <SignBlock title={tx("{v0}. Model release (optional)", {
            v0: ++step
          })} done={p.release_signed} doneText={tx("Signed. Thank you for letting us share your photos!")} text={fill(d.release, vals)} signLabel={tx("Sign model release")}
            onSign={async (name) => { const { error } = await supabase.rpc("portal_sign_release", { p_token: token, p_name: name }); if (error) throw error; toast(tx("Model release signed. Thank you!"), true); load(); }} />}

          <section className="card" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}><h2 className="h-m">{++step}{tx(". Your gallery")}</h2><Pill c={d.gallery ? "p-success" : "p-neutral"}>{d.gallery ? tx("Ready") : tx("After the shoot")}</Pill></div>
            {d.gallery ? <p>{d.gallery.title}· {d.gallery.photo_count}{" "}{tx("photos. Your download link is on its way.")}</p>
              : <p className="sub">{tx(
              "Your photos land here after your session. We'll message you the moment they're ready."
            )}</p>}
          </section>
        </div>
        <aside style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>
          <section className="card"><h2 className="h-m" style={{ marginBottom: 8 }}>{tx("Your session")}</h2>
            <div className="todo">
              <div className="todo-item"><span className="dot d-joy"><Icon name="calendar" /></span><div className="todo-text"><b>{fday(d.booking?.starts_at || p.session_date)}</b><span>{d.booking ? ftime(d.booking.starts_at) : tx("Time to be confirmed")}</span></div></div>
              <div className="todo-item"><span className="dot d-info"><Icon name="clock" /></span><div className="todo-text"><b>{d.booking?.location || tx("Location to be confirmed")}</b><span>{tx("Total")}{" "}{money(p.amount, p.currency)}</span></div></div>
            </div>
          </section>
          <section className="card" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <h2 className="h-m">{tx("Questions?")}</h2><p className="sub" style={{ fontSize: 13 }}>{tx("Message")}{" "}{s.name}{" "}{tx("here.")}</p>
            <div className="field"><label htmlFor="portal-msg">{tx("Your message")}</label><textarea id="portal-msg" value={msg} onChange={(e) => setMsg(e.target.value)} placeholder={tx("Can I bring an extra outfit?")} /></div>
            <button className="btn btn-secondary" style={{ alignSelf: "flex-start" }} onClick={async () => {
              if (!msg.trim()) return toast(tx("Write a message first"));
              const { error } = await supabase.rpc("portal_send_message", { p_token: token, p_body: msg });
              if (error) return toast(error.message);
              setMsg(""); toast(tx("Message sent"));
            }}><Icon name="send" />{tx("Send")}</button>
          </section>
          <p className="sub" style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 6 }}>{tx("Powered by")}{" "}<Mark dot="currentColor" style={{ width: 10, height: 14 }} />{" "}{tx("jovita")}</p>
        </aside>
      </div>
    </div>
  );
}
