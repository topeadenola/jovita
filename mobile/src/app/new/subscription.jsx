import { useState } from "react";
import { View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useData } from "../../lib/data";
import { CURRENCIES, SYM, todayISO } from "../../lib/format";
import { SUBSCRIPTION_PRESETS } from "../../lib/accounting";
import { Button, Chips, Field, Screen, Txt, useToast } from "../../components/ui";
import { C, F } from "../../lib/theme";
import { tx } from "../../lib/i18n";

const Label = ({ children }) => <Txt style={{ fontFamily: F.semi, fontSize: 13 }}>{children}</Txt>;

export default function SubscriptionScreen() {
  const { id } = useLocalSearchParams();
  const { subscriptions, loading } = useData();
  if (loading) return <Screen><Txt>{tx("Loading…")}</Txt></Screen>;
  const sub = id ? subscriptions.find((x) => x.id === id) : null;
  if (id && !sub) return <Screen><Txt>{tx("This subscription was removed.")}</Txt></Screen>;
  return <SubForm sub={sub} />;
}

function SubForm({ sub }) {
  const { cur } = useLocalSearchParams();
  const { insert, update } = useData();
  const toast = useToast();
  const [f, setF] = useState(sub ? { name: sub.name, amount: String(sub.amount), currency: sub.currency, cycle: sub.cycle, next_renewal: sub.next_renewal }
    : { name: "", amount: "", currency: cur && cur !== "NGN" ? cur : "USD", cycle: "monthly", next_renewal: todayISO() });
  const [err, setErr] = useState("");
  const set = (k) => (v) => setF({ ...f, [k]: v });
  return (
    <Screen refresh={false}>
      {!sub && (<><Label>{tx("Popular tools")}</Label><Chips options={SUBSCRIPTION_PRESETS.map((p) => [p, p])} value={f.name} onChange={set("name")} /></>)}
      <Field label={tx("App or service")} value={f.name} onChangeText={set("name")} placeholder={tx("e.g. Evoto")} />
      <View style={{ flexDirection: "row", gap: 12 }}>
        <Field style={{ flex: 1 }} label={tx("Price")} value={f.amount} onChangeText={set("amount")} keyboardType="decimal-pad" placeholder={tx("Each payment")} />
        <View style={{ gap: 6 }}><Label>{tx("Currency")}</Label><Chips scroll={false} options={CURRENCIES.map((c) => [c, SYM[c]])} value={f.currency} onChange={set("currency")} /></View>
      </View>
      <Label>{tx("Billed")}</Label>
      <Chips scroll={false} options={[["monthly", "Every month"], ["yearly", "Every year"]]} value={f.cycle} onChange={set("cycle")} />
      <Field label={tx("Next renewal")} value={f.next_renewal} onChangeText={set("next_renewal")} placeholder={tx("YYYY-MM-DD")} />
      {!!err && <Txt style={{ color: C.danger }}>{err}</Txt>}
      <Button title={tx("Save")} onPress={async () => {
        if (!f.name.trim()) return setErr(tx("Name the app, e.g. Adobe Creative Cloud."));
        if (!/^\d{4}-\d{2}-\d{2}$/.test(f.next_renewal)) return setErr(tx("Write the date as YYYY-MM-DD."));
        const row = { ...f, name: f.name.trim(), amount: Number(f.amount) || 0 };
        try { if (sub) await update("subscriptions", sub.id, row); else await insert("subscriptions", row); toast(tx("Subscription saved")); router.back(); }
        catch (e) { setErr(e.message); }
      }} />
      {sub && <Button variant="ghost" title={tx("Cancel this subscription")} onPress={async () => { await update("subscriptions", sub.id, { active: false }); toast(tx("{name} cancelled", {
        name: sub.name
      })); router.back(); }} />}
    </Screen>
  );
}
