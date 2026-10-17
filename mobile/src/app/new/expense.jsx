import { useState } from "react";
import { View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useData } from "../../lib/data";
import { CURRENCIES, SYM, todayISO } from "../../lib/format";
import { EXPENSE_CATEGORIES } from "../../lib/accounting";
import { Button, Chips, Field, Screen, Txt, useToast } from "../../components/ui";
import { C, F } from "../../lib/theme";
import { tx } from "../../lib/i18n";

const Label = ({ children }) => <Txt style={{ fontFamily: F.semi, fontSize: 13 }}>{children}</Txt>;

export default function NewExpense() {
  const { cur } = useLocalSearchParams();
  const { insert, projects, studio } = useData();
  const toast = useToast();
  const [f, setF] = useState({ vendor: "", category: "Equipment", amount: "", currency: cur || studio?.home_currency || "NGN", spent_on: todayISO(), note: "", project_id: "" });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k) => (v) => setF({ ...f, [k]: v });
  return (
    <Screen refresh={false}>
      <Field label={tx("Paid to")} value={f.vendor} onChangeText={set("vendor")} placeholder={tx("e.g. Jumia, B&H, Uber")} />
      <View style={{ flexDirection: "row", gap: 12 }}>
        <Field style={{ flex: 1 }} label={tx("Amount")} value={f.amount} onChangeText={set("amount")} keyboardType="decimal-pad" placeholder="0" />
        <View style={{ gap: 6 }}><Label>{tx("Currency")}</Label><Chips scroll={false} options={CURRENCIES.map((c) => [c, SYM[c]])} value={f.currency} onChange={set("currency")} /></View>
      </View>
      <Label>{tx("Category")}</Label>
      <Chips scroll={false} options={EXPENSE_CATEGORIES.map((c) => [c, c])} value={f.category} onChange={set("category")} />
      <Field label={tx("Date")} value={f.spent_on} onChangeText={set("spent_on")} placeholder={tx("YYYY-MM-DD")} />
      {projects.length > 0 && (<><Label>{tx("For a project?")}</Label><Chips options={[["", "General"], ...projects.map((p) => [p.id, p.title])]} value={f.project_id} onChange={set("project_id")} /></>)}
      <Field label={tx("Note")} value={f.note} onChangeText={set("note")} placeholder={tx("e.g. 50mm lens")} />
      {!!err && <Txt style={{ color: C.danger }}>{err}</Txt>}
      <Button title={busy ? tx("Saving…") : tx("Save expense")} disabled={busy} onPress={async () => {
        if (!f.vendor.trim()) return setErr(tx("Who did you pay?"));
        if (!(Number(f.amount) > 0)) return setErr(tx("Add an amount above zero."));
        if (!/^\d{4}-\d{2}-\d{2}$/.test(f.spent_on)) return setErr(tx("Write the date as YYYY-MM-DD."));
        setBusy(true);
        try { await insert("expenses", { ...f, vendor: f.vendor.trim(), amount: Number(f.amount), project_id: f.project_id || null }); toast(tx("Expense saved")); router.back(); }
        catch (e) { setErr(e.message); } finally { setBusy(false); }
      }} />
    </Screen>
  );
}
