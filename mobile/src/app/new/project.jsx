import { useState } from "react";
import { View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useData } from "../../lib/data";
import { CURRENCIES, PROJECT_TYPES, SYM, addDays } from "../../lib/format";
import { Button, Chips, Field, Screen, Txt, useToast } from "../../components/ui";
import { C, F } from "../../lib/theme";
import { tx } from "../../lib/i18n";

const Label = ({ children }) => <Txt style={{ fontFamily: F.semi, fontSize: 13 }}>{children}</Txt>;

export default function NewProject() {
  const { loading } = useData();
  if (loading) return <Screen><Txt>{tx("Loading…")}</Txt></Screen>;
  return <NewProjectForm />;
}

function NewProjectForm() {
  const { client: pre } = useLocalSearchParams();
  const { clients, templates, studio, insert } = useData();
  const toast = useToast();
  const contracts = templates.filter((t) => t.kind === "contract");
  const releases = templates.filter((t) => t.kind === "model_release");
  const [f, setF] = useState({
    client_id: pre || clients[0]?.id || "", title: "", type: "Portrait", session_date: addDays(14), amount: "", currency: studio?.home_currency || "NGN",
    contract_template_id: (contracts.find((t) => t.is_default) || contracts[0])?.id || "",
    release_template_id: (releases.find((t) => t.is_default) || releases[0])?.id || "",
  });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k) => (v) => setF({ ...f, [k]: v });

  if (!clients.length) return <Screen><Txt>{tx("Add a client first, then create a project for them.")}</Txt><Button title={tx("Add a client")} onPress={() => router.replace("/new/client")} /></Screen>;

  return (
    <Screen refresh={false}>
      <Label>{tx("Client")}</Label>
      <Chips options={clients.map((c) => [c.id, c.name])} value={f.client_id} onChange={set("client_id")} />
      <Field label={tx("What's the job?")} value={f.title} onChangeText={set("title")} placeholder={tx("e.g. Engagement shoot")} />
      <Label>{tx("Type")}</Label>
      <Chips options={PROJECT_TYPES.map((t) => [t, t])} value={f.type} onChange={set("type")} />
      <Field label={tx("Session date")} value={f.session_date} onChangeText={set("session_date")} placeholder={tx("YYYY-MM-DD")} help={tx("Year-month-day, e.g. 2026-11-24")} />
      <View style={{ flexDirection: "row", gap: 12 }}>
        <Field style={{ flex: 1 }} label={tx("Fee")} value={f.amount} onChangeText={set("amount")} keyboardType="decimal-pad" placeholder="250000" />
        <View style={{ gap: 6 }}><Label>{tx("Currency")}</Label><Chips scroll={false} options={CURRENCIES.map((c) => [c, SYM[c]])} value={f.currency} onChange={set("currency")} /></View>
      </View>
      <Label>{tx("Contract")}</Label>
      <Chips options={[...contracts.map((t) => [t.id, t.name]), ["", "None"]]} value={f.contract_template_id} onChange={set("contract_template_id")} />
      <Label>{tx("Model release")}</Label>
      <Chips options={[...releases.map((t) => [t.id, t.name]), ["", "Not needed"]]} value={f.release_template_id} onChange={set("release_template_id")} />
      {!!err && <Txt style={{ color: C.danger }}>{err}</Txt>}
      <Button title={busy ? tx("Saving…") : tx("Create project")} disabled={busy} onPress={async () => {
        if (!f.title.trim()) return setErr(tx("Say what the job is, e.g. Engagement shoot."));
        if (f.session_date && !/^\d{4}-\d{2}-\d{2}$/.test(f.session_date)) return setErr(tx("Write the date as YYYY-MM-DD."));
        setBusy(true);
        try {
          const p = await insert("projects", { ...f, title: f.title.trim(), amount: Number(f.amount) || 0, session_date: f.session_date || null, contract_template_id: f.contract_template_id || null, release_template_id: f.release_template_id || null });
          toast(tx("Project created. Next: share the quote."));
          router.replace(`/project/${p.id}`);
        } catch (e) { setErr(e.message); } finally { setBusy(false); }
      }} />
    </Screen>
  );
}
