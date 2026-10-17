import { useState } from "react";
import { router } from "expo-router";
import { useData } from "../../lib/data";
import { Button, Chips, Field, Screen, Txt, useToast } from "../../components/ui";
import { C } from "../../lib/theme";
import { tx } from "../../lib/i18n";

export default function NewClient() {
  const { insert } = useData();
  const toast = useToast();
  const [f, setF] = useState({ name: "", phone: "", email: "", city: "", status: "lead" });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k) => (v) => setF({ ...f, [k]: v });
  return (
    <Screen refresh={false}>
      <Field label={tx("Full name")} value={f.name} onChangeText={set("name")} placeholder={tx("e.g. Bisi Ojo")} autoFocus />
      <Field label={tx("Phone / WhatsApp")} value={f.phone} onChangeText={set("phone")} placeholder="+234 …" keyboardType="phone-pad" />
      <Field label={tx("Email")} value={f.email} onChangeText={set("email")} placeholder={tx("bisi@example.com")} keyboardType="email-address" autoCapitalize="none" />
      <Field label={tx("City")} value={f.city} onChangeText={set("city")} placeholder={tx("Lagos")} />
      <Txt style={{ fontSize: 13, fontWeight: "600" }}>{tx("Status")}</Txt>
      <Chips scroll={false} options={[["lead", "Lead"], ["client", "Client"]]} value={f.status} onChange={set("status")} />
      {!!err && <Txt style={{ color: C.danger }}>{err}</Txt>}
      <Button title={busy ? tx("Saving…") : tx("Add client")} disabled={busy} onPress={async () => {
        if (!f.name.trim()) return setErr(tx("Add the client's name."));
        setBusy(true);
        try { const c = await insert("clients", { ...f, name: f.name.trim() }); toast(tx("{name} added", {
          name: c.name
        })); router.replace(`/client/${c.id}`); }
        catch (e) { setErr(e.message); } finally { setBusy(false); }
      }} />
    </Screen>
  );
}
