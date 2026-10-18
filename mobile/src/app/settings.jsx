import { View } from "react-native";
import { useState } from "react";
import { useData } from "../lib/data";
import { CURRENCIES, SYM } from "../lib/format";
import { Button, Card, Chips, Field, Row, Screen, ToggleRow, Txt, useToast } from "../components/ui";
import { router } from "expo-router";
import { C, F } from "../lib/theme";
import { LANGS, tx } from "../lib/i18n";
import { useLang } from "../lib/lang";
import { useTheme } from "../components/Theme";
import { draftNudge, LENGTH, WARMTH } from "../lib/voice";
import { money } from "../lib/format";

export default function Settings() {
  const { studio } = useData();
  if (!studio) return <Screen><Txt>{tx("Loading…")}</Txt></Screen>;
  return <SettingsForm />;
}

function SettingsForm() {
  const { studio, updateStudio } = useData();
  const toast = useToast();
  const { change } = useLang();
  const [f, setF] = useState({ name: studio.name, owner_first_name: studio.owner_first_name, home_currency: studio.home_currency, bank_details: studio.bank_details });
  const set = (k) => (v) => setF({ ...f, [k]: v });
  const { mode, setMode } = useTheme();
  const [tone, setTone] = useState({ w: studio.tone_warmth ?? 2, l: studio.tone_length ?? 1 });
  const saveTone = async (next) => { setTone(next); try { await updateStudio({ tone_warmth: next.w, tone_length: next.l }); } catch (e) { toast(e.message); } };
  const sample = draftNudge({ name: "Tara", amount: money(1400000, "NGN"), label: tx("newborn session"), late: 2, warmth: tone.w, length: tone.l, signer: studio.owner_first_name });
  const tog = async (k, v, label) => { try { await updateStudio({ [k]: v }); toast(v ? tx("{label} on", { label: tx(label) }) : tx("{label} off", { label: tx(label) })); } catch (e) { toast(e.message); } };
  return (
    <Screen>
      <Card>
        <Txt variant="h2">{tx("Your studio")}</Txt>
        <Field label={tx("Studio name")} value={f.name} onChangeText={set("name")} />
        <Field label={tx("Your first name")} value={f.owner_first_name} onChangeText={set("owner_first_name")} />
        <Txt style={{ fontFamily: F.semi, fontSize: 13 }}>{tx("Home currency")}</Txt>
        <Chips scroll={false} options={CURRENCIES.map((c) => [c, `${c} ${SYM[c]}`])} value={f.home_currency} onChange={set("home_currency")} />
        <Field label={tx("Bank transfer details")} value={f.bank_details} onChangeText={set("bank_details")} multiline inputStyle={{ height: 110 }}
          placeholder={tx("Bank: [Your bank]\nAccount name: [Name]\nAccount number: [0000000000]")} help={tx("Clients see this in their portal when they pay by transfer.")} />
        <Button title={tx("Save changes")} onPress={async () => { try { await updateStudio(f); toast(tx("Saved")); } catch (e) { toast(e.message); } }} />
      </Card>
      <Card>
        <Txt variant="h2">{tx("App language")}</Txt>
        <Chips scroll={false} options={[["", "Automatic"], ...LANGS]} value={studio.language || ""}
          onChange={async (l) => { try { await updateStudio({ language: l }); change(l, { persist: !!l }); } catch (e) { toast(e.message); } }} />
        <Txt style={{ fontSize: 13, color: C.muted }}>{tx("Automatic follows your phone's region and language. Your clients see their portal in their own language.")}</Txt>
      </Card>
      <Card>
        <Txt variant="h2">{tx("Train your Jovita")}</Txt>
        <Txt style={{ fontSize: 13, color: C.muted }}>{tx("How your reminders and replies sound. Ask Jovita writes in this voice.")}</Txt>
        <Txt style={{ fontFamily: F.semi, fontSize: 13 }}>{tx("Tone")}</Txt>
        <Chips scroll={false} options={WARMTH.map((w, ix) => [ix, w])} value={tone.w} onChange={(v) => saveTone({ ...tone, w: v })} />
        <Txt style={{ fontFamily: F.semi, fontSize: 13 }}>{tx("Length")}</Txt>
        <Chips scroll={false} options={LENGTH.map((w, ix) => [ix, w])} value={tone.l} onChange={(v) => saveTone({ ...tone, l: v })} />
        <View style={{ backgroundColor: C.lilac, borderRadius: 14, padding: 12, gap: 2 }}>
          <Txt style={{ fontSize: 12, fontFamily: F.bold, color: C.muted }}>{tx("Sample reminder")}</Txt>
          <Txt style={{ fontSize: 14, lineHeight: 20 }}>{sample}</Txt>
        </View>
      </Card>
      <Card>
        <Txt variant="h2">{tx("Appearance")}</Txt>
        <Chips scroll={false} options={[["light", "Bright"], ["dark", "Dark"], ["auto", "Automatic"]]} value={mode} onChange={(m) => setMode(m, "/settings")} />
        <Txt style={{ fontSize: 13, color: C.muted }}>{tx("Automatic follows your phone.")}</Txt>
      </Card>
      <Card style={{ paddingVertical: 4 }}>
        <ToggleRow title={tx("Automatic invoice reminders")} sub={tx("On by default")} value={studio.reminders_on} onChange={(v) => tog("reminders_on", v, "Reminders")} />
        <ToggleRow title={tx("3 days before it's due")} value={studio.remind_before} onChange={(v) => tog("remind_before", v, "Early reminder")} />
        <ToggleRow title={tx("When it's overdue")} value={studio.remind_after} onChange={(v) => tog("remind_after", v, "Overdue reminder")} />
      </Card>
      <Card style={{ paddingVertical: 4 }}>
        <Row title={tx("Plan")} sub={tx("See plans, try Pro free or upgrade")} onPress={() => router.push("/plan")} right={<View style={{ paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999, backgroundColor: C.marigold }}><Txt style={{ fontSize: 12, fontFamily: F.bold, color: "#261433" }}>{tx("Upgrade")}</Txt></View>} />
        <Row title={tx("Payments")} sub={tx("Connect Paystack, Flutterwave, PayPal, Stripe or your bank. Switch on or off, or disconnect.")} onPress={() => router.push("/payments")} last />
      </Card>
    </Screen>
  );
}
