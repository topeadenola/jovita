import { useEffect, useState } from "react";
import { View } from "react-native";
import { useData } from "../lib/data";
import { PLANS, TRIAL_DAYS, daysLeft, loadPrices, offerPrice, rank, requestUpgrade, startTrial, usePlan } from "../lib/plan";
import { supabase } from "../lib/supabase";
import { money } from "../lib/format";
import { Button, Card, Screen, Txt, useToast } from "../components/ui";
import Icon from "../components/Icon";
import { C, F } from "../lib/theme";
import { locale, tx, txn } from "../lib/i18n";

const NAME = { free: "Free", pro: "Pro", studio: "Studio" };
const longDate = (iso) => new Date(iso).toLocaleDateString(locale(), { day: "numeric", month: "long", year: "numeric" });

function Tag({ joy, children }) {
  return <View style={{ paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999, backgroundColor: joy ? C.marigold : C.sunken }}><Txt style={{ fontSize: 12, fontFamily: F.bold, color: joy ? "#261433" : C.muted }}>{children}</Txt></View>;
}

export default function PlanScreen() {
  const { studio } = useData();
  const [plan, setPlan] = usePlan(studio);
  const toast = useToast();
  const [prices, setPrices] = useState({});
  const [quota, setQuota] = useState(null);
  const [busy, setBusy] = useState("");
  const [asked, setAsked] = useState("");
  useEffect(() => { if (studio) loadPrices(studio.home_currency).then(setPrices); }, [studio?.home_currency]);
  useEffect(() => { supabase.rpc("jovita_quota").then(({ data }) => data && setQuota(data)).catch(() => {}); }, [plan.plan, plan.status]);
  if (!studio) return null;
  const trial = plan.status === "trialing";
  const canTrial = plan.plan === "free" && !plan.trial_used;
  const mine = trial ? 0 : rank(plan.plan);
  const headline = trial ? null : plan.plan === "studio" ? tx("You have everything Jovita offers. Need less? You can downgrade to Pro or Free any time.") : plan.plan === "pro" ? tx("Want unlimited Jovita and priority help? Studio has it. Need less? You can downgrade any time.") : tx("Upgrade to put your brand on client pages and let Jovita do more.");

  const choose = async (key) => {
    setBusy(key);
    try {
      if (key === "pro" && canTrial) {
        const r = await startTrial();
        if (r?.error === "trial_used") toast(tx("You've already had your free trial."));
        else { setPlan({ ...plan, plan: "pro", status: "trialing", trial_used: true, trial_ends_at: r?.trial_ends_at || new Date(Date.now() + TRIAL_DAYS * 864e5).toISOString() }); toast(tx("Pro is on for {n} days. Enjoy!", { n: TRIAL_DAYS })); }
      } else { await requestUpgrade(key); setAsked(key); }
    } catch (e) { toast(tx("That didn't work: {err}", { err: e.message })); }
    setBusy("");
  };

  return (
    <Screen>
      <Card tone="lilac">
        <Txt variant="h2">{trial ? tx("Pro trial") : plan.plan === "studio" ? tx("You're on Studio, our top plan") : tx("{plan} plan", { plan: tx(NAME[plan.plan]) })}</Txt>
        <Txt style={{ color: C.muted }}>{trial ? tx("Ends on {date}. You go back to Free after, unless you upgrade.", { date: longDate(plan.trial_ends_at) }) : headline}</Txt>
        {quota ? (
          <View style={{ gap: 6, marginTop: 4 }}>
            <Txt style={{ fontSize: 13, color: C.muted }}>{quota.period === "total" ? tx("Free Jovita questions used") : tx("Jovita questions this month")}: <Txt style={{ fontFamily: F.bold, color: C.ink }}>{quota.limit == null ? `${quota.used} · ${tx("Unlimited")}` : `${quota.used} / ${quota.limit}`}</Txt></Txt>
            {quota.limit != null ? <View style={{ height: 8, borderRadius: 4, backgroundColor: C.line, overflow: "hidden" }}><View style={{ height: 8, width: `${Math.min(100, Math.round((quota.used / Math.max(1, quota.limit)) * 100))}%`, backgroundColor: C.ink }} /></View> : null}
          </View>
        ) : null}
      </Card>
      {PLANS.map((p) => {
        const price = prices[p.key];
        const current = !trial && plan.plan === p.key;
        const onTrial = trial && p.key === "pro";
        const down = !trial && rank(p.key) < mine;
        const offer = !current && !down && prices.offers?.[p.key];
        return (
          <Card key={p.key} style={p.key === "pro" ? { borderWidth: 2, borderColor: C.ink } : null}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Txt variant="h2">{tx(p.name)}</Txt>
              {current ? <Tag>{tx("Your plan")}</Tag> : onTrial ? <Tag joy>{txn(daysLeft(plan.trial_ends_at), "Trial · {n} day left", "Trial · {n} days left")}</Tag> : p.badge && !down ? <Tag joy>{tx(p.badge)}</Tag> : null}
            </View>
            {price ? <Txt><Txt style={{ fontFamily: F.displayBold, fontSize: 26 }}>{money(offer ? offerPrice(price.monthly_amount, offer.percent_off) : price.monthly_amount, price.currency)}</Txt><Txt style={{ color: C.muted }}> {tx("/ month")}</Txt></Txt> : null}
            {offer && price ? (
              <View style={{ backgroundColor: C.marigold, borderRadius: 10, padding: 10, gap: 2 }}>
                <Txt style={{ fontFamily: F.bold, fontSize: 13, color: "#261433" }}>★ {tx("{n}% off", { n: offer.percent_off })}{offer.label ? ` · ${offer.label}` : ""} <Txt style={{ textDecorationLine: "line-through", fontFamily: F.semi, color: "#261433" }}>{money(price.monthly_amount, price.currency)}</Txt></Txt>
                <Txt style={{ fontSize: 12, color: "#261433" }}>{offer.months ? txn(offer.months, "First month, then {price}.", "First {n} months, then {price}.", { price: money(price.monthly_amount, price.currency) }) : tx("For as long as you stay subscribed.")}{offer.ends_at ? " " + tx("Offer ends {date}.", { date: longDate(offer.ends_at) }) : ""}</Txt>
              </View>
            ) : null}
            <Txt style={{ color: C.muted }}>{tx(p.line)}</Txt>
            {p.features.map((f) => (
              <View key={f} style={{ flexDirection: "row", gap: 8 }}><Icon name="check" size={16} color={C.success} /><Txt style={{ flex: 1, fontSize: 14 }}>{tx(f)}</Txt></View>
            ))}
            {current ? null : asked === p.key ? (
              <Txt style={{ fontFamily: F.semi, fontSize: 14 }}>{down ? tx("Got it. We'll confirm the change by email. You keep everything until then.") : tx("Thanks! Paid plans open very soon. We'll email you the moment you can upgrade.")}</Txt>
            ) : down ? (
              <Button variant="secondary" disabled={!!busy} onPress={() => choose(p.key)} title={busy === p.key ? tx("One moment…") : tx("Downgrade to {plan}", { plan: tx(p.name) })} />
            ) : p.key === "free" ? null : (
              <Button variant={p.key === "pro" ? "joy" : "primary"} disabled={!!busy} onPress={() => choose(onTrial ? "pro" : p.key)}
                title={busy === p.key ? tx("One moment…") : onTrial ? tx("Keep Pro after the trial") : p.key === "pro" && canTrial ? tx("Try Pro free for {n} days", { n: TRIAL_DAYS }) : tx("Upgrade to {plan}", { plan: tx(p.name) })} />
            )}
            {down && asked !== p.key ? <Txt style={{ fontSize: 12, color: C.muted }}>{p.key === "free" ? tx("You'd lose your branding and most Jovita questions.") : tx("You can come back to {plan} any time.", { plan: tx(NAME[plan.plan]) })}</Txt> : null}
            {p.key === "pro" && canTrial && !asked ? <Txt style={{ fontSize: 12, color: C.muted }}>{tx("No card needed. You go back to Free after, unless you upgrade.")}</Txt> : null}
          </Card>
        );
      })}
    </Screen>
  );
}
