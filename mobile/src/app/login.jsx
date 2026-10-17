import { useEffect, useRef, useState } from "react";
import { Animated, Easing, KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { supabase } from "../lib/supabase";
import { Mark } from "../components/Icon";
import { Button, Field, Txt } from "../components/ui";
import { C, F } from "../lib/theme";
import { LANGS, tx } from "../lib/i18n";
import { useLang } from "../lib/lang";

export default function Login() {
  const insets = useSafeAreaInsets();
  const { lang, change } = useLang();
  const [mode, setMode] = useState("signin");
  const [f, setF] = useState({ first: "", studio: "", email: "", password: "" });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const pop = useRef(new Animated.Value(0)).current;
  const bob = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(pop, { toValue: 1, friction: 5, useNativeDriver: true }).start();
    Animated.loop(Animated.sequence([
      Animated.timing(bob, { toValue: 1, duration: 2400, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      Animated.timing(bob, { toValue: 0, duration: 2400, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
    ])).start();
  }, [pop, bob]);
  const set = (k) => (v) => setF({ ...f, [k]: v });

  async function submit() {
    setBusy(true); setMsg(null);
    try {
      if (mode === "signup") {
        if (!f.first.trim() || !f.studio.trim()) throw new Error(tx("Add your first name and studio name."));
        const { data, error } = await supabase.auth.signUp({ email: f.email.trim(), password: f.password, options: { data: { first_name: f.first.trim(), studio_name: f.studio.trim() } } });
        if (error) throw error;
        if (!data.session) {
          const { error: e2 } = await supabase.auth.signInWithPassword({ email: f.email.trim(), password: f.password });
          if (e2) setMsg({ ok: true, text: tx("Check your email to confirm your account, then sign in.") });
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: f.email.trim(), password: f.password });
        if (error) throw error;
      }
    } catch (e) { setMsg({ ok: false, text: e.message }); } finally { setBusy(false); }
  }

  const scale = pop.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] });
  const y = bob.interpolate({ inputRange: [0, 1], outputRange: [0, -10] });
  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: C.paper }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 40 }}>
        <View style={{ backgroundColor: C.marigold, paddingTop: insets.top + 40, paddingBottom: 40, paddingHorizontal: 24, borderBottomLeftRadius: 40, borderBottomRightRadius: 40, overflow: "hidden", gap: 18 }}>
          <Animated.View style={{ position: "absolute", width: 170, height: 170, borderRadius: 85, right: -50, top: insets.top - 10, backgroundColor: C.lilac2, transform: [{ translateY: y }] }} />
          <Animated.View style={{ position: "absolute", width: 40, height: 40, borderRadius: 20, right: 150, top: insets.top + 24, backgroundColor: C.plumSoft, transform: [{ translateY: y }] }} />
          <Animated.View style={{ width: 84, height: 84, borderRadius: 24, backgroundColor: C.surface, alignItems: "center", justifyContent: "center", transform: [{ scale }] }}>
            <Mark size={52} />
          </Animated.View>
          <Txt style={{ fontFamily: F.display, fontSize: 40, lineHeight: 42, letterSpacing: -1 }}>{tx("Run your creative business with joy.")}</Txt>
          <Txt style={{ color: "#4A3000", fontSize: 16 }}>{tx("Clients, contracts, invoices and galleries in your pocket.")}</Txt>
        </View>
        <View style={{ padding: 24, gap: 14 }}>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }} accessibilityLabel={tx("Language")}>
            {LANGS.map(([k]) => (
              <Pressable key={k} onPress={() => change(k)} accessibilityRole="button" accessibilityState={{ selected: lang === k }}
                style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 99, backgroundColor: lang === k ? C.plumCard : C.sunken }}>
                <Txt style={{ fontFamily: F.bold, fontSize: 12, color: lang === k ? C.marigold : C.muted }}>{k.toUpperCase()}</Txt>
              </Pressable>
            ))}
          </View>
          <Txt variant="h2">{mode === "signup" ? tx("Create your studio") : tx("Welcome back")}</Txt>
          {mode === "signup" && (
            <View style={{ flexDirection: "row", gap: 12 }}>
              <Field style={{ flex: 1 }} label={tx("First name")} value={f.first} onChangeText={set("first")} placeholder={tx("Tope")} />
              <Field style={{ flex: 1 }} label={tx("Studio name")} value={f.studio} onChangeText={set("studio")} placeholder={tx("HorploadWorks")} />
            </View>
          )}
          <Field label={tx("Email")} value={f.email} onChangeText={set("email")} autoCapitalize="none" keyboardType="email-address" autoComplete="email" textContentType="emailAddress" />
          <Field label={tx("Password")} value={f.password} onChangeText={set("password")} secureTextEntry autoComplete={mode === "signup" ? "new-password" : "current-password"} help={mode === "signup" ? tx("At least 8 characters.") : undefined} />
          {msg && <Txt style={{ color: msg.ok ? C.success : C.danger }}>{msg.text}</Txt>}
          <Button title={busy ? tx("One moment…") : mode === "signup" ? tx("Create my studio") : tx("Sign in")} onPress={submit} disabled={busy} />
          <Pressable onPress={() => { setMode(mode === "signup" ? "signin" : "signup"); setMsg(null); }} style={{ alignSelf: "center", padding: 10 }}>
            <Txt style={{ fontFamily: F.semi }}>{mode === "signup" ? tx("Already have a studio? Sign in") : tx("New to Jovita? Create a studio")}</Txt>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
