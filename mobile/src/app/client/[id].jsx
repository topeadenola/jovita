import { useState } from "react";
import { Linking, View } from "react-native";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { useData } from "../../lib/data";
import { fday, first, money, projPill } from "../../lib/format";
import Icon from "../../components/Icon";
import { Avatar, Button, Card, Chips, Field, Pill, Row, Screen, Txt, useToast } from "../../components/ui";
import { C } from "../../lib/theme";
import { tx } from "../../lib/i18n";

const digits = (p = "") => p.replace(/[^\d]/g, "");

export default function ClientScreen() {
  const { id } = useLocalSearchParams();
  const { clients, loading } = useData();
  const c = clients.find((x) => x.id === id);
  if (loading) return <Screen><Txt>{tx("Loading…")}</Txt></Screen>;
  if (!c) return <Screen><Txt>{tx("This client was deleted.")}</Txt></Screen>;
  return <ClientDetail key={c.id} c={c} />;
}

function ClientDetail({ c }) {
  const { projects, invoices, update, remove } = useData();
  const toast = useToast();
  const [f, setF] = useState(() => ({ name: c.name, email: c.email || "", phone: c.phone || "", city: c.city || "", status: c.status }));
  const [confirm, setConfirm] = useState(false);
  const ps = projects.filter((p) => p.client_id === c.id);
  const owes = invoices.filter((i) => i.client_id === c.id && i.status === "sent");
  const set = (k) => (v) => setF({ ...f, [k]: v });
  const open = (url) => Linking.openURL(url).catch(() => toast(tx("Couldn't open that app")));

  return (
    <Screen>
      <Stack.Screen options={{ title: first(c.name) }} />
      <View style={{ flexDirection: "row", gap: 14, alignItems: "center" }}>
        <Avatar name={c.name} size={60} tone="mari" />
        <View style={{ flex: 1 }}><Txt variant="h1" style={{ fontSize: 26, lineHeight: 30 }}>{c.name}</Txt><Txt style={{ color: C.muted }}>{c.city || tx("No city")} · {c.status === "lead" ? tx("Lead") : tx("Client")}</Txt></View>
      </View>
      <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
        {!!c.phone && <Button small title={tx("Call")} icon="phone" variant="secondary" onPress={() => open(`tel:${digits(c.phone)}`)} />}
        {!!c.phone && <Button small title={tx("WhatsApp")} icon="chat" onPress={() => open(`https://wa.me/${digits(c.phone)}`)} />}
        {!!c.email && <Button small title={tx("Email")} icon="mail" variant="secondary" onPress={() => open(`mailto:${c.email}`)} />}
      </View>
      {owes.length > 0 && <Card style={{ backgroundColor: C.warningTint, borderColor: C.warningTint }}><Txt style={{ fontWeight: "700" }}>{tx("Owes you")}{" "}{owes.map((i) => money(i.amount, i.currency)).join(" + ")}</Txt></Card>}
      <Card>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Txt variant="h2">{tx("Projects")}</Txt>
          <Button small variant="ghost" icon="plus" title={tx("New")} onPress={() => router.push({ pathname: "/new/project", params: { client: c.id } })} />
        </View>
        {ps.map((p, ix) => { const pl = projPill(p); return (
          <Row key={p.id} last={ix === ps.length - 1} onPress={() => router.push(`/project/${p.id}`)} title={p.title} sub={`${fday(p.session_date)} · ${money(p.amount, p.currency)}`} right={<Pill c={pl.c}>{pl.k}</Pill>} />
        ); })}
        {!ps.length && <Txt style={{ color: C.muted }}>{tx("No projects yet.")}</Txt>}
      </Card>
      <Card>
        <Txt variant="h2">{tx("Details")}</Txt>
        <Field label={tx("Name")} value={f.name} onChangeText={set("name")} />
        <Field label={tx("Phone / WhatsApp")} value={f.phone} onChangeText={set("phone")} keyboardType="phone-pad" />
        <Field label={tx("Email")} value={f.email} onChangeText={set("email")} keyboardType="email-address" autoCapitalize="none" />
        <Field label={tx("City")} value={f.city} onChangeText={set("city")} />
        <Chips scroll={false} options={[["lead", "Lead"], ["client", "Client"]]} value={f.status} onChange={set("status")} />
        <Button title={tx("Save")} onPress={async () => { try { await update("clients", c.id, f); toast(tx("Client saved")); } catch (e) { toast(e.message); } }} />
      </Card>
      {confirm ? (
        <Card style={{ borderColor: C.danger }}>
          <Txt>{tx("Delete")}{" "}{first(c.name)}{tx("? This also deletes their projects, invoices and messages.")}</Txt>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Button small variant="ghost" title={tx("Keep")} onPress={() => setConfirm(false)} />
            <Button small variant="danger" title={tx("Delete client")} onPress={async () => { await remove("clients", c.id); toast(tx("Client deleted")); router.back(); }} />
          </View>
        </Card>
      ) : <Button variant="ghost" title={tx("Delete client")} onPress={() => setConfirm(true)} style={{ alignSelf: "flex-start" }} />}
    </Screen>
  );
}
