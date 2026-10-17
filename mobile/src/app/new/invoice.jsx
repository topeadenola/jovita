import { useMemo, useState } from "react";
import { View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useData } from "../../lib/data";
import { CURRENCIES, SYM, addDays, first, money } from "../../lib/format";
import { Button, Chips, Field, Screen, Txt, useToast } from "../../components/ui";
import { C, F } from "../../lib/theme";
import { tx } from "../../lib/i18n";

const Label = ({ children }) => <Txt style={{ fontFamily: F.semi, fontSize: 13 }}>{children}</Txt>;

export default function NewInvoice() {
  const { loading } = useData();
  if (loading) return <Screen><Txt>{tx("Loading…")}</Txt></Screen>;
  return <NewInvoiceForm />;
}

function NewInvoiceForm() {
  const { project: preProjectId } = useLocalSearchParams();
  const { clients, projects, templates, studio, insert, client } = useData();
  const toast = useToast();
  const invTemplates = templates.filter((t) => t.kind === "invoice");
  const pre = projects.find((p) => p.id === preProjectId);
  const [f, setF] = useState({
    client_id: pre?.client_id || clients[0]?.id || "", project_id: pre?.id || "", template: "",
    label: pre ? "Deposit (50%)" : "", amount: pre ? String(Math.round(pre.amount / 2)) : "",
    currency: pre?.currency || studio?.home_currency || "NGN", due_date: addDays(7),
  });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k) => (v) => setF({ ...f, [k]: v });
  const clientProjects = useMemo(() => projects.filter((p) => p.client_id === f.client_id), [projects, f.client_id]);

  const applyTemplate = (id) => {
    const t = invTemplates.find((x) => x.id === id);
    if (!t) return setF({ ...f, template: "" });
    const total = (t.items || []).reduce((s, it) => s + Number(it.qty || 0) * Number(it.price || 0), 0);
    setF({ ...f, template: id, label: t.name, amount: String(total), currency: t.currency });
  };
  const save = async (status) => {
    const amt = Number(f.amount);
    if (!f.label.trim()) return setErr(tx("Say what the invoice is for."));
    if (!amt) return setErr(tx("Add an amount above zero."));
    setBusy(true);
    try {
      const inv = await insert("invoices", { client_id: f.client_id, project_id: f.project_id || null, label: f.label.trim(), amount: amt, currency: f.currency, due_date: f.due_date, status });
      toast(status === "sent" ? tx("Invoice #{number} ready for {first}", {
        number: inv.number,
        first: first(client(f.client_id).name)
      }) : tx("Invoice #{number} saved as a draft", {
        number: inv.number
      }));
      router.back();
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };

  if (!clients.length) return <Screen><Txt>{tx("Add a client first.")}</Txt></Screen>;
  return (
    <Screen refresh={false}>
      {invTemplates.length > 0 && (<><Label>{tx("Start from a package")}</Label>
        <Chips options={[["", "Blank"], ...invTemplates.map((t) => [t.id, t.name])]} value={f.template} onChange={applyTemplate} /></>)}
      <Label>{tx("Client")}</Label>
      <Chips options={clients.map((c) => [c.id, c.name])} value={f.client_id} onChange={(v) => setF({ ...f, client_id: v, project_id: "" })} />
      {clientProjects.length > 0 && (<><Label>{tx("Project")}</Label>
        <Chips options={[["", "None"], ...clientProjects.map((p) => [p.id, p.title])]} value={f.project_id} onChange={set("project_id")} /></>)}
      <Field label={tx("What's it for?")} value={f.label} onChangeText={set("label")} placeholder={tx("e.g. Deposit (50%)")} />
      <View style={{ flexDirection: "row", gap: 12 }}>
        <Field style={{ flex: 1 }} label={tx("Amount")} value={f.amount} onChangeText={set("amount")} keyboardType="decimal-pad" />
        <View style={{ gap: 6 }}><Label>{tx("Currency")}</Label><Chips scroll={false} options={CURRENCIES.map((c) => [c, SYM[c]])} value={f.currency} onChange={set("currency")} /></View>
      </View>
      <Field label={tx("Due date")} value={f.due_date} onChangeText={set("due_date")} placeholder={tx("YYYY-MM-DD")} />
      <Txt style={{ color: C.muted }}>{tx("Total")}{" "}{money(f.amount || 0, f.currency)}</Txt>
      {!!err && <Txt style={{ color: C.danger }}>{err}</Txt>}
      <Button title={busy ? tx("Saving…") : tx("Save and send")} disabled={busy} onPress={() => save("sent")} />
      <Button variant="secondary" title={tx("Save as draft")} disabled={busy} onPress={() => save("draft")} />
    </Screen>
  );
}
