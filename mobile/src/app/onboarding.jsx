import { useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useData } from "../lib/data";
import { CURRENCIES, SYM } from "../lib/format";
import { Button, Chips, Field, Txt, useToast } from "../components/ui";
import Jo from "../components/Jo";
import { C, F } from "../lib/theme";
import { tx } from "../lib/i18n";

const CAREERS = [["📷", "Photographer"], ["🎬", "Videographer"], ["💄", "Makeup artist"], ["📱", "Content creator"], ["🎨", "Designer"], ["✂️", "Stylist"], ["✨", "Something else"]];

// First run for a new studio: what you do → your studio → Today
export default function Onboarding() {
  const { studio, updateStudio } = useData();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState(0);
  const [picked, setPicked] = useState(() => new Set(studio?.careers || []));
  const [f, setF] = useState({ name: studio?.name === "My studio" ? "" : studio?.name || "", owner_first_name: studio?.owner_first_name || "", home_currency: studio?.home_currency || "NGN" });
  const [busy, setBusy] = useState(false);
  if (!studio) return null;

  const names = CAREERS.map((c) => c[1]).filter((n) => picked.has(n));
  const joSays = step === 1 ? tx("Lovely. What's your studio called? Clients see this on every invoice.")
    : names.length === 0 ? tx("Hi{name}! I'm Jo. Tap what you do and I'll set things up.", { name: studio.owner_first_name ? " " + studio.owner_first_name : "" })
    : names.length === 1 ? tx("Nice, a {what}! I'll get your packages ready.", { what: tx(names[0]).toLowerCase() })
    : tx("Ooh, {n} hats! I'll set up packages for each.", { n: names.length });
  const toggle = (n) => setPicked((s) => { const x = new Set(s); x.has(n) ? x.delete(n) : x.add(n); return x; });
  const finish = async () => {
    if (!f.name.trim()) return toast(tx("Add your studio name"));
    setBusy(true);
    try {
      await updateStudio({ careers: names, name: f.name.trim(), owner_first_name: f.owner_first_name.trim(), home_currency: f.home_currency, onboarded: true });
      router.replace("/");
    } catch (e) { toast(e.message); setBusy(false); }
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.paper }} contentContainerStyle={{ paddingTop: insets.top + 20, paddingHorizontal: 20, paddingBottom: insets.bottom + 32, gap: 18 }} keyboardShouldPersistTaps="handled">
      <View style={{ flexDirection: "row", gap: 6 }}>
        <View style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: C.plumCard }} />
        <View style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: step ? C.plumCard : C.line }} />
      </View>
      <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 12 }}>
        <Jo mood={names.length || step ? "hello" : "think"} size={86} />
        <View style={{ flex: 1, marginBottom: 14, backgroundColor: C.surface, borderWidth: 1, borderColor: C.line, borderRadius: 18, borderBottomLeftRadius: 6, padding: 12 }}>
          <Txt style={{ fontFamily: F.semi }} accessibilityLiveRegion="polite">{joSays}</Txt>
        </View>
      </View>
      {step === 0 ? (
        <>
          <View><Txt variant="h1" style={{ fontSize: 28, lineHeight: 32 }}>{tx("What do you do?")}</Txt><Txt style={{ color: C.muted }}>{tx("Pick all that fit.")}</Txt></View>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
            {CAREERS.map(([emoji, label]) => {
              const on = picked.has(label);
              return (
                <Pressable key={label} onPress={() => toggle(label)} accessibilityRole="button" accessibilityState={{ selected: on }}
                  style={{ width: "48%", minHeight: 92, padding: 14, borderRadius: 18, borderWidth: 2, borderColor: on ? C.marigold : C.line, backgroundColor: on ? C.warningTint : C.surface, justifyContent: "space-between" }}>
                  <Txt style={{ fontSize: 26, lineHeight: 30 }}>{emoji}</Txt>
                  <Txt style={{ fontFamily: F.bold }}>{tx(label)}</Txt>
                </Pressable>
              );
            })}
          </View>
          <Button title={names.length ? tx("Continue") : tx("Pick at least one")} disabled={!names.length} onPress={() => setStep(1)} />
        </>
      ) : (
        <>
          <Txt variant="h1" style={{ fontSize: 28, lineHeight: 32 }}>{tx("Your studio")}</Txt>
          <Field label={tx("Studio name")} value={f.name} onChangeText={(v) => setF({ ...f, name: v })} placeholder={tx("e.g. SmithLine Photography")} />
          <Field label={tx("Your first name")} value={f.owner_first_name} onChangeText={(v) => setF({ ...f, owner_first_name: v })} />
          <Txt style={{ fontFamily: F.semi, fontSize: 13 }}>{tx("Home currency")}</Txt>
          <Chips scroll={false} options={CURRENCIES.map((c) => [c, `${c} ${SYM[c]}`])} value={f.home_currency} onChange={(v) => setF({ ...f, home_currency: v })} />
          <View style={{ flexDirection: "row", gap: 10 }}>
            <Button variant="secondary" title={tx("Back")} onPress={() => setStep(0)} />
            <Button style={{ flex: 1 }} title={busy ? tx("Setting up…") : tx("Open my studio")} disabled={busy} onPress={finish} />
          </View>
        </>
      )}
    </ScrollView>
  );
}
