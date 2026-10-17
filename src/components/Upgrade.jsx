import { useEffect, useState } from "react";
import { useData } from "../lib/data";
import { PLANS, TRIAL_DAYS, daysLeft, loadPrices, offerPrice, rank, requestUpgrade, startTrial } from "../lib/plan";
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
// Plans above yours say Upgrade, plans below say Downgrade.
export function PlanCards({ plan, onPlan, compact }) {
  const { studio } = useData();
  const toast = useToast();
  const [prices, setPrices] = useState({});
  const [busy, setBusy] = useState("");
  const [asked, setAsked] = useState("");
  useEffect(() => { loadPrices(studio.home_currency).then(setPrices); }, [studio.home_currency]);
  const trial = plan.status === "trialing";
  const canTrial = plan.plan === "free" && !plan.trial_used;
  const mine = trial ? 0 : rank(plan.plan); // during a trial you're really on Free

  const choose = async (key) => {
    setBusy(key);
    try {
      if (key === "pro" && canTrial) {
        const r = await startTrial();
        if (r?.error === "trial_used") toast(tx("You've already had your free trial."));
        else { onPlan?.({ ...plan, plan: "pro", status: "trialing", trial_used: true, trial_ends_at: r?.trial_ends_at || new Date(Date.now() + TRIAL_DAYS * 864e5).toISOString() }); toast(tx("Pro is on for {n} days. Enjoy!", { n: TRIAL_DAYS }), true); }
      } else {
        await requestUpgrade(key);
        setAsked(key);
      }
    } catch (e) { toast(tx("That didn't work: {err}", { err: e.message })); }
    setBusy("");
  };

  return (
    <div className={`plans ${compact ? "compact" : ""}`}>
      {PLANS.map((p) => {
        const price = prices[p.key];
        const current = !trial && plan.plan === p.key;
        const onTrial = trial && p.key === "pro";
        const down = !trial && rank(p.key) < mine;
        const offer = !current && !down && prices.offers?.[p.key];
        const btn = current ? null
          : down ? <button type="button" className="btn btn-secondary" disabled={!!busy} onClick={() => choose(p.key)}>{busy === p.key ? tx("One moment…") : tx("Downgrade to {plan}", { plan: tx(p.name) })}</button>
          : p.key === "free" ? null
          : onTrial ? <button type="button" className="btn btn-joy" disabled={!!busy} onClick={() => choose("pro")}>{busy === "pro" ? tx("One moment…") : tx("Keep Pro after the trial")}</button>
          : <button type="button" className={`btn ${p.key === "pro" ? "btn-joy" : "btn-primary"}`} disabled={!!busy} onClick={() => choose(p.key)}>
              {busy === p.key ? tx("One moment…") : p.key === "pro" && canTrial ? tx("Try Pro free for {n} days", { n: TRIAL_DAYS }) : tx("Upgrade to {plan}", { plan: tx(p.name) })}
            </button>;
        return (
          <article key={p.key} className={`plan-card ${p.key === "pro" ? "featured" : ""} ${current || onTrial ? "is-current" : ""}`}>
            <div className="pc-top">
              <h3>{tx(p.name)}</h3>
              {current ? <span className="pill p-neutral">{tx("Your plan")}</span> : onTrial ? <span className="pill p-joy">{txn(daysLeft(plan.trial_ends_at), "Trial · {n} day left", "Trial · {n} days left")}</span> : p.badge && !down ? <span className="pill p-joy">{tx(p.badge)}</span> : null}
            </div>
            <p className="pc-price">{!price ? <b>&nbsp;</b> : offer ? <><b>{money(offerPrice(price.monthly_amount, offer.percent_off), price.currency)}</b><span>{tx("/ month")}</span></> : <><b>{money(price.monthly_amount, price.currency)}</b><span>{tx("/ month")}</span></>}</p>
            {offer && price && <OfferNote offer={offer} full={money(price.monthly_amount, price.currency)} />}
            <p className="sub">{tx(p.line)}</p>
            <ul>{p.features.map((f) => <li key={f}><Icon name="check" />{tx(f)}</li>)}</ul>
            <div className="pc-foot">
              {asked === p.key ? <p className="pc-asked"><Icon name="check" />{down ? tx("Got it. We'll confirm the change by email. You keep everything until then.") : tx("Thanks! Paid plans open very soon. We'll email you the moment you can upgrade.")}</p> : btn}
              {p.key === "pro" && canTrial && !asked && <small className="sub">{tx("No card needed. You go back to Free after, unless you upgrade.")}</small>}
              {down && !asked && <small className="sub">{p.key === "free" ? tx("You'd lose your branding and most Jovita questions.") : tx("You can come back to {plan} any time.", { plan: tx(NAME[plan.plan]) })}</small>}
            </div>
          </article>
        );
      })}
    </div>
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

function sheetText(plan) {
  if (plan.status === "trialing") return [tx("You're trying Pro"), tx("Your trial ends on {date}. Upgrade any time to keep Pro.", { date: longDate(plan.trial_ends_at) })];
  if (plan.plan === "studio") return [tx("You're on Studio, our top plan"), tx("You have everything Jovita offers. Need less? You can downgrade to Pro or Free any time.")];
  if (plan.plan === "pro") return [tx("You're on Pro"), tx("Want unlimited Jovita and priority help? Studio has it. Need less? You can downgrade any time.")];
  return [tx("Do more with Pro"), tx("Your brand on every client page, and Jovita doing more of the work.")];
}

export function UpgradeSheet({ plan, onPlan, onClose }) {
  const [title, sub] = sheetText(plan);
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
  const [quota, setQuota] = useState(null);
  useEffect(() => { supabase.rpc("jovita_quota").then(({ data }) => data && setQuota(data)).catch(() => {}); }, [plan.plan, plan.status]);
  const trial = plan.status === "trialing";
  const [, sub] = sheetText(plan);
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
      <PlanCards plan={plan} onPlan={onPlan} />
    </section>
  );
}
