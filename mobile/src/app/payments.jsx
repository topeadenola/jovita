import { useCallback, useEffect, useState } from "react";
import { Alert, Pressable, Switch, View } from "react-native";
import { supabase } from "../lib/supabase";
import { useData } from "../lib/data";
import { ORDER, PROVIDERS, bankText, isTest, mask } from "../lib/payments";
import { Button, Card, Chips, Field, Screen, Txt, useToast } from "../components/ui";
import { C, F } from "../lib/theme";
import { tx } from "../lib/i18n";

const COLS = "id, studio_id, provider, enabled, label, public_key, details, secret_hint, test_mode, connected_at";
const LOGO = { paystack: ["P", "#0BA4DB"], flutterwave: ["F", "#F5A623"], paypal: ["P", "#003087"], stripe: ["S", "#635BFF"], bank: ["₦", "#261433"] };

function ConnectForm({ provider, account, onDone }) {
  const { studio } = useData();
  const toast = useToast();
  const P = PROVIDERS[provider];
  const [f, setF] = useState(() => {
    const x = { public_key: account?.public_key || "", secret: "", test_mode: account?.test_mode || false };
    P.fields.filter((fl) => fl.detail).forEach((fl) => { x[fl.k] = account?.details?.[fl.k] || (fl.k === "currency" ? studio.home_currency : ""); });
    return x;
  });
  const [busy, setBusy] = useState(false);
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v, ...(k === "public_key" && isTest(v) ? { test_mode: true } : {}) }));
  const save = async () => {
    for (const fl of P.fields) {
      const v = (f[fl.k] || "").trim();
      if (fl.secret && account && !v) continue;
      if ((fl.required || !fl.detail) && !v) return toast(tx("Add the {field}.", { field: tx(fl.label) }));
      if (fl.re && v && !fl.re.test(v)) return toast(tx("That {field} doesn't look right. Copy it again from {where}.", { field: tx(fl.label), where: P.help }));
    }
    setBusy(true);
    try {
      const details = {};
      P.fields.filter((fl) => fl.detail).forEach((fl) => { details[fl.k] = (f[fl.k] || "").trim(); });
      const row = { provider, public_key: f.public_key.trim(), details, test_mode: !!f.test_mode, label: provider === "bank" ? `${details.bank_name} · ${details.currency || ""}`.trim() : P.name };
      if (f.secret.trim()) { row.secret = f.secret.trim(); row.secret_hint = "…" + f.secret.trim().slice(-4); }
      const { error } = account ? await supabase.from("payment_accounts").update(row).eq("id", account.id) : await supabase.from("payment_accounts").insert({ ...row, studio_id: studio.id, enabled: true });
      if (error) throw error;
      toast(account ? tx("{name} updated", { name: P.name }) : tx("{name} connected and switched on", { name: P.name }));
      onDone(true);
    } catch (e) { toast(/duplicate|unique/i.test(e.message) ? tx("{name} is already connected.", { name: P.name }) : e.message); setBusy(false); }
  };
  return (
    <Card>
      <Txt variant="h2">{account ? tx("Edit {name}", { name: P.name }) : tx("Connect {name}", { name: P.name })}</Txt>
      {P.help ? <Txt style={{ fontSize: 13, color: C.muted }}>{tx("Find these in {where}. Money goes straight to your own {name} account; Jovita never holds it.", { where: P.help, name: P.name })}</Txt> : null}
      {P.fields.map((fl) => fl.select
        ? <View key={fl.k} style={{ gap: 6 }}><Txt style={{ fontFamily: F.semi, fontSize: 13 }}>{tx(fl.label)}</Txt><Chips options={fl.select.map((c) => [c, c])} value={f[fl.k]} onChange={set(fl.k)} /></View>
        : <Field key={fl.k} label={tx(fl.label)} value={f[fl.k]} onChangeText={set(fl.k)} autoCapitalize="none" autoCorrect={false} secureTextEntry={!!fl.secret}
            placeholder={fl.secret && account?.secret_hint ? tx("Saved ({hint}). Leave blank to keep it.", { hint: account.secret_hint }) : fl.ph}
            help={fl.secret ? tx("Stored safely and never shown again, not even to you.") : undefined} />)}
      {provider !== "bank" && (
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Txt style={{ flex: 1 }}>{tx("These are test keys (no real money)")}</Txt>
          <Switch value={!!f.test_mode} onValueChange={(v) => setF((x) => ({ ...x, test_mode: v }))} trackColor={{ true: C.toggleOn, false: C.lineStrong }} />
        </View>
      )}
      <View style={{ flexDirection: "row", gap: 10 }}>
        <Button title={tx("Cancel")} variant="secondary" onPress={() => onDone(false)} style={{ flex: 1 }} />
        <Button title={busy ? tx("Saving…") : account ? tx("Save") : tx("Connect")} onPress={save} disabled={busy} style={{ flex: 1 }} />
      </View>
    </Card>
  );
}

// Phone: connect your own payment accounts, switch each on or off, or disconnect
export default function Payments() {
  const { studio } = useData();
  if (!studio) return <Screen><Txt>{tx("Loading…")}</Txt></Screen>;
  return <PaymentsScreen />;
}

function PaymentsScreen() {
  const { studio, updateStudio } = useData();
  const toast = useToast();
  const [rows, setRows] = useState(null);
  const [missing, setMissing] = useState(false);
  const [form, setForm] = useState(null);

  const fetchRows = useCallback(async () => {
    const { data, error } = await supabase.from("payment_accounts").select(COLS).eq("studio_id", studio.id).order("connected_at", { ascending: true });
    if (error) { setMissing(true); return []; }
    return data || [];
  }, [studio.id]);
  useEffect(() => { fetchRows().then(setRows); }, [fetchRows]);
  const reload = async () => {
    const list = await fetchRows(); setRows(list);
    const patch = {};
    ORDER.forEach((p) => { const on = list.some((a) => a.provider === p && a.enabled); if (!!studio[PROVIDERS[p].flag] !== on) patch[PROVIDERS[p].flag] = on; });
    const banks = list.filter((a) => a.provider === "bank" && a.enabled);
    if (banks.length) { const text = banks.map((a) => bankText(a.details)).join("\n\n"); if (text !== studio.bank_details) patch.bank_details = text; }
    if (Object.keys(patch).length) updateStudio(patch).catch(() => {});
  };
  const toggle = async (a, on) => {
    const { error } = await supabase.from("payment_accounts").update({ enabled: on }).eq("id", a.id);
    if (error) return toast(error.message);
    toast(on ? tx("{name} on. Clients can pay this way.", { name: a.label }) : tx("{name} off. Clients won't see it.", { name: a.label }));
    reload();
  };
  const disconnect = (a) => Alert.alert(tx("Disconnect {name}?", { name: a.label }), tx("Its keys are deleted from Jovita and clients can no longer pay this way. You can connect again any time."), [
    { text: tx("Cancel"), style: "cancel" },
    { text: tx("Disconnect"), style: "destructive", onPress: async () => { const { error } = await supabase.from("payment_accounts").delete().eq("id", a.id); if (error) return toast(error.message); toast(tx("{name} disconnected", { name: a.label })); reload(); } },
  ]);

  if (missing) return <Screen><Card><Txt variant="h2">{tx("How clients can pay you")}</Txt><Txt style={{ color: C.muted }}>{tx("Run the latest Jovita update in Supabase (RUN-THIS-IN-SUPABASE.sql) to connect your own Paystack, Flutterwave, PayPal, Stripe and bank accounts.")}</Txt></Card></Screen>;
  if (form) return <Screen><ConnectForm {...form} onDone={(saved) => { setForm(null); if (saved) reload(); }} /></Screen>;

  const item = (p, a) => {
    const P = PROVIDERS[p];
    const [ch, col] = LOGO[p];
    return (
      <View key={a?.id || p} style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, borderTopWidth: 1, borderTopColor: C.line }}>
        <View style={{ width: 38, height: 38, borderRadius: 11, backgroundColor: col, alignItems: "center", justifyContent: "center" }}><Txt style={{ color: "#fff", fontFamily: F.bold, fontSize: 17 }}>{ch}</Txt></View>
        <View style={{ flex: 1 }}>
          <Txt style={{ fontFamily: F.semi }}>{a && p === "bank" ? a.label : P.name}{a?.test_mode ? `  · ${tx("Test mode")}` : ""}</Txt>
          <Txt style={{ fontSize: 13, color: C.muted }}>{a ? (p === "bank" ? `${a.details?.account_name || ""} · …${String(a.details?.account_number || "").slice(-4)}` : `${tx("Connected")} · ${mask(a.public_key)}`) : tx(P.blurb)}</Txt>
          {a ? (
            <View style={{ flexDirection: "row", gap: 16, marginTop: 6 }}>
              <Pressable onPress={() => setForm({ provider: p, account: a })} accessibilityRole="button"><Txt style={{ fontFamily: F.semi, fontSize: 13 }}>{tx("Edit")}</Txt></Pressable>
              <Pressable onPress={() => disconnect(a)} accessibilityRole="button"><Txt style={{ fontFamily: F.semi, fontSize: 13, color: "#B42F26" }}>{tx("Disconnect")}</Txt></Pressable>
            </View>
          ) : null}
        </View>
        {a ? <Switch value={!!a.enabled} onValueChange={(v) => toggle(a, v)} trackColor={{ true: C.toggleOn, false: C.lineStrong }} thumbColor={a.enabled ? C.knobOn : "#FFFFFF"} accessibilityLabel={tx("Accept {name}", { name: P.name })} />
          : <Button small variant="secondary" title={tx("Connect")} onPress={() => setForm({ provider: p })} />}
      </View>
    );
  };
  const list = rows || [];
  return (
    <Screen>
      <Card>
        <Txt variant="h2">{tx("How clients can pay you")}</Txt>
        <Txt style={{ fontSize: 13, color: C.muted }}>{tx("Connect your own accounts. Money goes straight to you. Switch each one on or off, or disconnect it any time.")}</Txt>
        {rows === null ? <Txt>{tx("Loading…")}</Txt> : ORDER.filter((p) => p !== "bank").map((p) => item(p, list.find((a) => a.provider === p)))}
      </Card>
      <Card>
        <Txt variant="h2">{tx("Bank accounts")}</Txt>
        <Txt style={{ fontSize: 13, color: C.muted }}>{tx("Add one for each currency you get paid in. Clients see the details when they choose bank transfer.")}</Txt>
        {list.filter((a) => a.provider === "bank").map((a) => item("bank", a))}
        <Button variant="secondary" title={tx("Add bank account")} onPress={() => setForm({ provider: "bank" })} />
      </Card>
    </Screen>
  );
}
