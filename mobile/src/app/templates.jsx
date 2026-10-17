import { useState } from "react";
import { router } from "expo-router";
import { useData } from "../lib/data";
import Icon from "../components/Icon";
import { Button, Card, Chips, Pill, Row, Screen, Txt, useToast } from "../components/ui";
import { C } from "../lib/theme";
import { tx } from "../lib/i18n";

const KINDS = [["contract", "Contracts"], ["model_release", "Releases"], ["invoice", "Invoices"], ["email", "Emails"]];
const BLANK = {
  contract: { name: "New contract", body: "This agreement is between {studio_name} and {client_name} for a {project_type} session on {session_date}.\n\n1. Fee\nThe total fee is {project_amount}.\n" },
  model_release: { name: "New model release", body: "I, {client_name}, give {studio_name} permission to use images taken on {session_date} for portfolio and promotional use.\n" },
  invoice: { name: "New package", body: "Thank you for your business.", items: [{ name: "Session", qty: 1, price: 0 }] },
  email: { name: "New email", subject: "A note from {studio_name}", body: "Hi {client_first_name},\n\n\n\n{studio_name}" },
};

export default function Templates() {
  const { templates, insert } = useData();
  const toast = useToast();
  const [kind, setKind] = useState("contract");
  const list = templates.filter((t) => t.kind === kind).sort((a, b) => (b.is_default - a.is_default) || a.name.localeCompare(b.name));
  return (
    <Screen>
      <Txt style={{ color: C.muted }}>{tx(
        "Write them once. Every client gets their own copy with their details filled in."
      )}</Txt>
      <Chips options={KINDS} value={kind} onChange={setKind} />
      <Card style={{ paddingVertical: 4 }}>
        {list.map((t, ix) => (
          <Row key={t.id} last={ix === list.length - 1} onPress={() => router.push(`/template/${t.id}`)} title={t.name}
            sub={(t.body || "").replace(/\s+/g, " ").slice(0, 70)} right={t.is_default ? <Pill c="p-joy">{tx("Default")}</Pill> : <Icon name="chevron" size={18} color={C.muted} />} />
        ))}
        {!list.length && <Txt style={{ color: C.muted, paddingVertical: 12 }}>{tx("None yet.")}</Txt>}
      </Card>
      <Button title={tx("New template")} icon="plus" variant="secondary" onPress={async () => {
        try { const b = BLANK[kind]; const t = await insert("templates", { kind, ...b, name: tx(b.name), body: tx(b.body), ...(b.subject ? { subject: tx(b.subject) } : {}), ...(b.items ? { items: b.items.map((it) => ({ ...it, name: tx(it.name) })) } : {}), is_default: list.length === 0 }); router.push(`/template/${t.id}`); } catch (e) { toast(e.message); }
      }} />
    </Screen>
  );
}
