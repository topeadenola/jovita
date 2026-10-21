import { useEffect, useState } from "react";
import { useData } from "../lib/data";
import { PLANS, TRIAL_DAYS, YEARLY_OFF, daysLeft, loadPrices, offerPrice, openBilling, rank, requestUpgrade, startCheckout, startTrial, waitForPaidPlan, yearlyPrice } from "../lib/plan";
import { money } from "../lib/format";
import { locale, tx, txn } from "../lib/i18n";
import { supabase } from "../supabase";
import { CloseBtn, Modal, useToast } from "./ui";
import Icon from "./Icon";

const NAME = { free: "Free", pro: "Pro", studio: "Studio" };
const longDate = (iso) => new Date(iso).toLocaleDateString(locale(), { day: "numeric", month: "long", year: "numeric" });

// Top-left of the app, under the studio name
export function PlanBadge({ plan, onOpen }) {
  if (!plan) return null;
  const trial = plan.status === "trialing";
  if (plan.plan !== "free" && !trial) {
    return <button type="button" className="plan-tag" onClick={onOpen} title={tx("Manage your plan")}><Icon name="star" />{tx("{plan} plan", { plan: tx(NAME[plan.plan]) })}</button>;
  }
  const left = daysLeft(plan.trial_ends_at);
  return (
    <button type="button" className={`plan-badge ${trial ? "is-trial" : ""}`} onClick={onOpen}>
      <span className="pb-plan">{trial ? tx("Pro trial") : tx("Free plan")}</span>
      <span className="pb-cta"><Icon name="star" />{trial ? txn(left, "{n} day left", "{n} days left") : plan.trial_used ? tx("Upgrade") : tx("Try Pro free")}</span>
    </button>
  );
}

// The three plans side by side, used in the sheet and in Settings.
// Every plan can be picked except the one you're on. Picking one shows a short summary, then the secure payment page.
export function PlanCards({ plan, onPlan, compact }) {
  const { studio } = useData();
  const toast = useToast();
  const [prices, setPrices] = useState({});
  const [busy, setBusy] = useState("");
  const [asked, setAsked] = useState("");
  const [pick, setPick] = useState(null); // plan key being confirmed
  const [cycle, setCycle] = useState(studio.plan_cycle || "month");
  useEffect(() => { loadPrices(studio.home_currency).then(setPrices); }, [studio.home_currency]);
  const trial = plan.status === "trialing";
  const canTrial = plan.plan === "free" && !plan.trial_used;
  const mine = trial ? 0 : rank(plan.plan); // during a trial you're really on Free
  const subscribed = !!(studio.lemon_subscription_id && studio.plan_autorenew && plan.plan !== "free");

  const amount = (key, cyc = cycle) => {
    const price = prices[key];
    if (!price || !Number(price.monthly_amount)) return null;
    const offer = prices.offers?.[key];
    const m = offer ? offerPrice(price.monthly_amount, offer.percent_off) : Number(price.monthly_amount);
    return { value: cyc === "year" ? yearlyPrice(m) : m, currency: price.currency, offer };
  };

  const tryFree = async () => {
    setBusy("trial");
    try {
      const r = await startTrial();
      if (r?.error === "trial_used") toast(tx("You've already had your free trial."));
      else { onPlan?.({ ...plan, plan: "pro", status: "trialing", trial_used: true, trial_ends_at: r?.trial_ends_at || new Date(Date.now() + TRIAL_DAYS * 864e5).toISOString() }); toast(tx("Pro is on for {n} days. Enjoy!", { n: TRIAL_DAYS }), true); }
    } catch (e) { toast(tx("That didn't work: {err}", { err: e.message })); }
    setBusy("");
  };

  const go = async () => {
    const key = pick;
    setBusy(key);
    try {
      if (subscribed) { await openBilling(); return; } // plan changes, card and cancelling live on the billing page
      if (key !== "free") { await startCheckout(key, cycle); return; } // off to the payment page
      await requestUpgrade(key, cycle); // gifted or manually paid plans: we switch them by hand
      setAsked(key); setPick(null);
    } catch (e) { toast(tx("That didn't work: {err}", { err: e.message })); }
    setBusy("");
  };

  const cycleSwitch = (
    <div className="cycle-switch" role="group" aria-label={tx("How you pay")}>
      <button type="button" aria-pressed={cycle === "month"} onClick={() => setCycle("month")}>{tx("Monthly")}</button>
      <button type="button" aria-pressed={cycle === "year"} onClick={() => setCycle("year")}>{tx("Yearly")} <span className="save">{tx("Save {n}%", { n: YEARLY_OFF })}</span></button>
    </div>
  );

  // Step 2: what you're about to pay for
  if (pick) {
    const P = PLANS.find((x) => x.key === pick);
    const a = amount(pick);
    const down = !trial && rank(pick) < mine;
    return (
      <div className="plan-confirm">
        <button type="button" className="btn btn-ghost btn-sm pcf-back" onClick={() => setPick(null)}><Icon name="arrow" />{tx("All plans")}</button>
        <div className="pcf-head">
          <p className="eyebrow">{down ? tx("Switch plan") : tx("Upgrade")}</p>
          <h3 className="h-l">{pick === "free" ? tx("Move to Free") : tx("Jovita {plan}", { plan: tx(P.name) })}</h3>
          <p className="sub">{tx(P.line)}</p>
        </div>
        {pick !== "free" && !subscribed && cycleSwitch}
        {pick !== "free" && a && !subscribed && (
          <div className="pcf-total">
            <span>{cycle === "year" ? tx("You pay today, then every year") : tx("You pay today, then every month")}</span>
            <b>{money(a.value, a.currency)}</b>
            {cycle === "year" && <small className="sub">{tx("Like paying {m} a month.", { m: money(Math.round(a.value / 12), a.currency) })}</small>}
            {a.offer && <small className="sub">{tx("Includes your {n}% offer.", { n: a.offer.percent_off })}</small>}
          </div>
        )}
        <ul className="pcf-points">
          {pick === "free" ? <>
            <li><Icon name="check" />{tx("You keep everything you've made.")}</li>
            <li><Icon name="check" />{tx("Your logo comes off client pages and Ask Jovita goes back to 10 questions.")}</li>
          </> : subscribed ? <>
            <li><Icon name="check" />{tx("You'll change your plan on your billing page. You only pay the difference.")}</li>
          </> : <>
            <li><Icon name="lock" />{tx("Pay securely by card, Apple Pay or PayPal.")}</li>
            <li><Icon name="check" />{tx("{plan} switches on the moment your payment goes through.", { plan: tx(P.name) })}</li>
            <li><Icon name="check" />{tx("Renews automatically. Cancel any time from Settings.")}</li>
          </>}
        </ul>
        <button type="button" className={`btn ${pick === "free" ? "btn-secondary" : "btn-primary"} pcf-go`} disabled={!!busy} onClick={go}>
          {busy ? tx("One moment…") : pick === "free" ? tx("Move to Free") : subscribed ? tx("Go to billing") : tx("Continue to payment")}
        </button>
        {pick !== "free" && !subscribed && <small className="sub pcf-fine">{tx("Payments are handled by Lemon Squeezy. Jovita never sees your card.")}</small>}
      </div>
    );
  }

  return (
    <>
    {cycleSwitch}
    <div className={`plans ${compact ? "compact" : ""}`}>
      {PLANS.map((p) => {
        const a = amount(p.key);
        const price = prices[p.key];
        const current = trial ? false : plan.plan === p.key;
        const onTrial = trial && p.key === "pro";
        const down = !trial && rank(p.key) < mine;
        const freeInTrial = trial && p.key === "free";
        const btn = current ? <button type="button" className="btn pc-mine" disabled>{tx("Your plan")}</button>
          : freeInTrial ? <button type="button" className="btn pc-mine" disabled>{tx("After your trial")}</button>
          : <button type="button" className={`btn ${down ? "btn-secondary" : p.key === "pro" ? "btn-joy" : "btn-primary"}`} disabled={!!busy} onClick={() => setPick(p.key)}>
              {onTrial ? tx("Pay for Pro now") : down ? tx("Switch to {plan}", { plan: tx(p.name) }) : tx("Upgrade to {plan}", { plan: tx(p.name) })}
            </button>;
        return (
          <article key={p.key} className={`plan-card ${p.key === "pro" ? "featured" : ""} ${current || onTrial ? "is-current" : ""}`}>
            <div className="pc-top">
              <h3>{tx(p.name)}</h3>
              {current ? <span className="pill p-neutral">{tx("Your plan")}</span> : onTrial ? <span className="pill p-joy">{txn(daysLeft(plan.trial_ends_at), "Trial · {n} day left", "Trial · {n} days left")}</span> : p.badge && !down ? <span className="pill p-joy">{tx(p.badge)}</span> : null}
            </div>
            <p className="pc-price">{!price ? <b>&nbsp;</b> : !a ? <><b>{money(0, price.currency)}</b><span>{tx("/ month")}</span></> : <><b>{money(a.value, a.currency)}</b><span>{cycle === "year" ? tx("/ year") : tx("/ month")}</span></>}</p>
            {cycle === "year" && a && <p className="pc-year sub">{tx("Like paying {m} a month. You save {s}.", { m: money(Math.round(yearlyPrice(price.monthly_amount) / 12), price.currency), s: money(Number(price.monthly_amount) * 12 - yearlyPrice(price.monthly_amount), price.currency) })}</p>}
            {a?.offer && cycle === "month" && !current && !down && <OfferNote offer={a.offer} full={money(price.monthly_amount, price.currency)} />}
            <p className="sub">{tx(p.line)}</p>
            <ul>{p.features.map((f) => <li key={f}><Icon name="check" />{tx(f)}</li>)}</ul>
            <div className="pc-foot">
              {asked === p.key ? <p className="pc-asked"><Icon name="check" />{tx("Got it. We'll confirm the change by email. You keep everything until then.")}</p> : btn}
              {p.key === "pro" && canTrial && !asked && (
                <button type="button" className="btn btn-ghost btn-sm pc-trial" disabled={!!busy} onClick={tryFree}>{busy === "trial" ? tx("One moment…") : tx("Or try it free for {n} days, no card", { n: TRIAL_DAYS })}</button>
              )}
            </div>
          </article>
        );
      })}
    </div>
    </>
  );
}

// "20% off · Launch offer — first 3 months, then ₦19,500. Ends 25 October."
function OfferNote({ offer, full }) {
  return (
    <p className="pc-offer">
      <b><Icon name="star" />{tx("{n}% off", { n: offer.percent_off })}{offer.label ? ` · ${offer.label}` : ""} <s>{full}</s></b>
      <span>{offer.months ? txn(offer.months, "First month, then {price}.", "First {n} months, then {price}.", { price: full }) : tx("For as long as you stay subscribed.")}{offer.ends_at ? " " + tx("Offer ends {date}.", { date: longDate(offer.ends_at) }) : ""}</span>
    </p>
  );
}

function sheetText(plan, auto) {
  if (plan.status === "gift") return [tx("You have {plan} free", { plan: plan.plan === "studio" ? "Studio" : "Pro" }), plan.until ? tx("A gift from the Jovita team, until {date}. Enjoy!", { date: longDate(new Date(new Date(plan.until).getTime() - 864e5).toISOString()) }) : tx("A gift from the Jovita team. Enjoy!")];
  if (plan.status === "trialing") return [tx("You're trying Pro"), tx("Your trial ends on {date}. Upgrade any time to keep Pro.", { date: longDate(plan.trial_ends_at) })];
  if (auto && plan.until && plan.plan !== "free" && plan.status !== "trialing") return [plan.plan === "studio" ? tx("You're on Studio, our top plan") : tx("You're on Pro"), plan.status === "past_due" ? tx("Your last payment didn't go through. Update your card in billing to keep your plan.") : tx("Renews automatically on {date}. Change or cancel any time in billing.", { date: longDate(new Date(new Date(plan.until).getTime() - 3 * 864e5).toISOString()) })];
  if (plan.until && plan.plan !== "free") { const d = longDate(plan.until); const left = Math.ceil((new Date(plan.until) - Date.now()) / 864e5); return [plan.plan === "studio" ? tx("You're on Studio, our top plan") : tx("You're on Pro"), left <= 7 ? tx("Your plan ends on {date}, in {n} days. Renew to keep everything.", { date: d, n: Math.max(0, left) }) : tx("Paid until {date}. We'll remind you by email a week before.", { date: d })]; }
  if (plan.plan === "studio") return [tx("You're on Studio, our top plan"), tx("You have everything Jovita offers. Need less? You can downgrade to Pro or Free any time.")];
  if (plan.plan === "pro") return [tx("You're on Pro"), tx("Want unlimited Jovita and priority help? Studio has it. Need less? You can downgrade any time.")];
  return [tx("Do more with Pro"), tx("Your brand on every client page, and Jovita doing more of the work.")];
}

export function UpgradeSheet({ plan, onPlan, onClose }) {
  const { studio } = useData();
  const [title, sub] = sheetText(plan, !!studio.plan_autorenew);
  return (
    <Modal label={tx("Plans")} onClose={onClose} wide>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
        <div style={{ flex: 1 }}><h2 className="h-l">{title}</h2><p className="sub">{sub}</p></div>
        <CloseBtn onClick={onClose} />
      </div>
      <PlanCards plan={plan} onPlan={onPlan} compact />
    </Modal>
  );
}

// "12 / 300 this month", "7 / 10 free questions", "Unlimited"
export function QuotaMeter({ quota }) {
  if (!quota) return null;
  const label = quota.period === "total" ? tx("Free Jovita questions used") : tx("Jovita questions this month");
  if (quota.limit == null) return <div className="plan-use"><span className="sub">{label}</span><b>{quota.used} · {tx("Unlimited")}</b></div>;
  const pct = Math.min(100, Math.round((quota.used / Math.max(1, quota.limit)) * 100));
  return (
    <div className="plan-use">
      <span className="sub">{label}</span>
      <b>{quota.used} / {quota.limit}</b>
      <span className="meter" role="progressbar" aria-valuemin={0} aria-valuemax={quota.limit} aria-valuenow={quota.used} aria-label={label}><i style={{ width: pct + "%" }} /></span>
    </div>
  );
}

// Settings › Plan
export function PlanTab({ plan, onPlan }) {
  const { studio } = useData();
  const toast = useToast();
  const [quota, setQuota] = useState(null);
  const [waiting, setWaiting] = useState(() => new URLSearchParams(window.location.search).get("paid") === "1");
  const [opening, setOpening] = useState(false);
  useEffect(() => { supabase.rpc("jovita_quota").then(({ data }) => data && setQuota(data)).catch(() => {}); }, [plan.plan, plan.status]);
  // Back from the checkout: wait for the payment to switch the plan on
  useEffect(() => {
    if (!waiting) return;
    let gone = false;
    waitForPaidPlan().then((p) => {
      if (gone) return;
      setWaiting(false);
      const u = new URL(window.location.href); u.searchParams.delete("paid"); window.history.replaceState(null, "", u);
      if (p) { onPlan?.(p); toast(tx("Payment received. Welcome to {plan}!", { plan: tx(NAME[p.plan]) }), true); }
      else toast(tx("We're still confirming your payment. It can take a minute, so refresh shortly."));
    });
    return () => { gone = true; };
  }, [waiting]); // eslint-disable-line react-hooks/exhaustive-deps
  const subscribed = !!(studio.lemon_subscription_id && studio.plan_autorenew && plan.plan !== "free");
  const billing = async () => { setOpening(true); try { await openBilling(); } catch (e) { toast(tx("That didn't work: {err}", { err: e.message })); setOpening(false); } };
  const trial = plan.status === "trialing";
  const [, sub] = sheetText(plan, !!studio.plan_autorenew);
  return (
    <section className="card set-card">
      <div className="set-head"><h2 className="h-m">{tx("Your plan")}</h2></div>
      <div className="plan-now">
        <div>
          <b>{trial ? tx("Pro trial") : tx("{plan} plan", { plan: tx(NAME[plan.plan]) })}</b>
          <span className="sub">{trial ? tx("Ends on {date}. You go back to Free after, unless you upgrade.", { date: longDate(plan.trial_ends_at) }) : sub}</span>
        </div>
        <QuotaMeter quota={quota} />
      </div>
      {waiting && <p className="pc-asked"><Icon name="check" />{tx("Thanks! Confirming your payment…")}</p>}
      {(subscribed || studio.lemon_subscription_id) && <p><button type="button" className="btn btn-secondary" disabled={opening} onClick={billing}>{opening ? tx("One moment…") : tx("Manage billing and receipts")}</button></p>}
      <PlanCards plan={plan} onPlan={onPlan} />
    </section>
  );
}
