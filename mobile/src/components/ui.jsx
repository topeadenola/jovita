import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { Animated, Easing, Pressable, RefreshControl, ScrollView, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { C, F, PILL, isDark, onScheme } from "../lib/theme";
import { useData } from "../lib/data";
import Icon, { Mark } from "./Icon";
import { tx } from "../lib/i18n";

/* ---------- Text ---------- */
export function Txt({ style, variant = "body", ...rest }) {
  return <Text style={[s[variant] || s.body, style]} {...rest} />;
}

/* ---------- Toast ---------- */
const ToastCtx = createContext(() => {});
export const useToast = () => useContext(ToastCtx);
export function ToastProvider({ children }) {
  const [msg, setMsg] = useState(null);
  const y = useRef(new Animated.Value(120)).current;
  const timer = useRef();
  const insets = useSafeAreaInsets();
  const show = useCallback((m) => {
    setMsg(m);
    Animated.spring(y, { toValue: 0, useNativeDriver: true, friction: 7 }).start();
    clearTimeout(timer.current);
    timer.current = setTimeout(() => Animated.timing(y, { toValue: 160, duration: 220, useNativeDriver: true }).start(), 3000);
  }, [y]);
  return (
    <ToastCtx.Provider value={show}>
      {children}
      {msg && (
        <Animated.View pointerEvents="none" style={[s.toast, { bottom: insets.bottom + 84, transform: [{ translateY: y }] }]} accessibilityLiveRegion="polite">
          <Mark size={20} dot="#FBF8FF" />
          <Txt style={{ color: "#FFFFFF", fontFamily: F.semi, flexShrink: 1 }}>{msg}</Txt>
        </Animated.View>
      )}
    </ToastCtx.Provider>
  );
}

/* ---------- Layout ---------- */
export function Screen({ children, header, padded = true, refresh = true, contentStyle }) {
  const { refresh: doRefresh, refreshing } = useData() || {};
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: C.paper }}
      contentContainerStyle={[{ paddingBottom: 120 }, contentStyle]}
      keyboardShouldPersistTaps="handled"
      refreshControl={refresh && doRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={doRefresh} tintColor={C.ink} /> : undefined}
    >
      {header}
      <View style={padded ? { paddingHorizontal: 16, gap: 16, paddingTop: header ? 0 : 16 } : null}>{children}</View>
    </ScrollView>
  );
}

// Playful marigold header with drifting blobs, like the landing page
export function BlobHeader({ eyebrow, title, sub, children }) {
  const insets = useSafeAreaInsets();
  const drift = useRef(new Animated.Value(0)).current;
  const enter = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(enter, { toValue: 1, duration: 600, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(drift, { toValue: 1, duration: 3200, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      Animated.timing(drift, { toValue: 0, duration: 3200, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [drift, enter]);
  const up = drift.interpolate({ inputRange: [0, 1], outputRange: [0, -10] });
  const down = drift.interpolate({ inputRange: [0, 1], outputRange: [0, 8] });
  const rise = enter.interpolate({ inputRange: [0, 1], outputRange: [18, 0] });
  return (
    <View style={[s.blobHeader, { paddingTop: insets.top + 18 }]}>
      <Animated.View style={[s.blob, { width: 150, height: 150, right: -70, top: insets.top - 70, backgroundColor: C.lilac2, borderRadius: 75, transform: [{ translateY: up }] }]} />
      <Animated.View style={[s.blob, { width: 30, height: 30, right: 70, top: insets.top + 64, backgroundColor: C.plumSoft, borderRadius: 17, transform: [{ translateY: down }] }]} />
      <Animated.View style={[s.blob, { width: 70, height: 70, left: -24, bottom: -28, backgroundColor: C.marigoldDeep, borderRadius: 35, transform: [{ translateY: up }] }]} />
      <Animated.View style={{ gap: 6, opacity: enter, transform: [{ translateY: rise }] }}>
        {eyebrow ? <Txt variant="eyebrowDark">{eyebrow}</Txt> : null}
        <Txt variant="h1" style={{ color: "#261433" }}>{title}</Txt>
        {sub ? <Txt style={{ color: "#4A3000", fontSize: 15, lineHeight: 21 }}>{sub}</Txt> : null}
      </Animated.View>
      {children}
    </View>
  );
}

export function PageTitle({ eyebrow, title, right }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ paddingTop: insets.top + 14, paddingHorizontal: 16, paddingBottom: 14, flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: 12 }}>
      <View style={{ flex: 1, gap: 4 }}>
        {eyebrow ? <Txt variant="eyebrow">{eyebrow}</Txt> : null}
        <Txt variant="h1">{title}</Txt>
      </View>
      {right}
    </View>
  );
}

export const Card = ({ style, children, tone }) => (
  <View style={[s.card, tone === "lilac" && { backgroundColor: C.lilac, borderColor: C.lilac }, tone === "mari" && { backgroundColor: C.marigold, borderColor: C.marigold }, tone === "plum" && { backgroundColor: C.plumCard, borderColor: C.plumCard }, style]}>{children}</View>
);

export function Pill({ c = "p-neutral", children }) {
  const [bg, fg] = PILL[c] || PILL["p-neutral"];
  return (
    <View style={[s.pill, { backgroundColor: bg }]}>
      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: fg }} />
      <Txt style={{ color: fg, fontFamily: F.bold, fontSize: 12 }}>{typeof children === "string" ? tx(children) : children}</Txt>
    </View>
  );
}

export function Button({ title, onPress, variant = "primary", icon, small, disabled, style }) {
  const v = {
    primary: { bg: C.action, fg: C.onAction, shadow: isDark ? C.marigoldDeep : C.marigold },
    joy: { bg: C.marigold, fg: "#261433", shadow: isDark ? C.marigoldDeep : C.plum },
    secondary: { bg: "transparent", fg: C.ink, border: C.ink },
    ghost: { bg: "transparent", fg: C.ink },
    danger: { bg: C.dangerTint, fg: C.danger },
  }[variant];
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        s.btn, small && s.btnSm,
        { backgroundColor: v.bg, borderColor: v.border || "transparent", borderWidth: v.border ? 2 : 0, opacity: disabled ? 0.5 : 1 },
        v.shadow && { borderBottomWidth: pressed ? 2 : 5, borderBottomColor: v.shadow, transform: [{ translateY: pressed ? 3 : 0 }] },
        !v.shadow && pressed && { opacity: 0.7 },
        style,
      ]}
    >
      {icon ? <Icon name={icon} size={small ? 16 : 18} color={v.fg} stroke={2.2} /> : null}
      <Txt style={{ color: v.fg, fontFamily: F.bold, fontSize: small ? 13 : 15 }}>{typeof title === "string" ? tx(title) : title}</Txt>
    </Pressable>
  );
}

export function Avatar({ name = "?", size = 40, tone }) {
  const n = name.split(/\s+/).filter(Boolean).map((w) => w[0]).slice(0, 2).join("").toUpperCase() || "?";
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: tone === "mari" ? C.marigold : C.lilac, alignItems: "center", justifyContent: "center" }}>
      <Txt style={{ fontFamily: F.bold, fontSize: size * 0.34, color: C.ink }}>{n}</Txt>
    </View>
  );
}

export function Field({ label, help, multiline, style, inputStyle, ...rest }) {
  return (
    <View style={[{ gap: 6 }, style]}>
      {label ? <Txt style={{ fontFamily: F.semi, fontSize: 13 }}>{label}</Txt> : null}
      <TextInput
        placeholderTextColor={C.lineStrong}
        multiline={multiline}
        style={[s.input, multiline && { height: 140, paddingTop: 12, textAlignVertical: "top" }, inputStyle]}
        accessibilityLabel={label}
        {...rest}
      />
      {help ? <Txt style={{ fontSize: 12, color: C.muted }}>{help}</Txt> : null}
    </View>
  );
}

export function Chips({ options, value, onChange, scroll = true }) {
  const inner = options.map(([k, label]) => {
    const on = k === value;
    return (
      <Pressable key={k} onPress={() => onChange(k)} accessibilityRole="button" accessibilityState={{ selected: on }}
        style={[s.chip, on && { backgroundColor: C.plumCard, borderColor: C.plumCard }]}>
        <Txt style={{ fontFamily: F.semi, fontSize: 13, color: on ? C.marigold : C.ink }}>{typeof label === "string" ? tx(label) : label}</Txt>
      </Pressable>
    );
  });
  return scroll
    ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingRight: 16 }}>{inner}</ScrollView>
    : <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>{inner}</View>;
}

export function ToggleRow({ title, sub, value, onChange }) {
  return (
    <View style={s.toggleRow}>
      <View style={{ flex: 1 }}><Txt style={{ fontFamily: F.semi }}>{tx(title)}</Txt>{sub ? <Txt style={{ fontSize: 13, color: C.muted }}>{tx(sub)}</Txt> : null}</View>
      <Switch value={!!value} onValueChange={onChange} trackColor={{ true: C.toggleOn, false: C.lineStrong }} thumbColor={value ? C.knobOn : "#FFFFFF"} accessibilityLabel={title} />
    </View>
  );
}

export function Row({ left, title, sub, right, onPress, last }) {
  const body = (
    <View style={[s.row, last && { borderBottomWidth: 0 }]}>
      {left}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Txt style={{ fontFamily: F.semi }} numberOfLines={2}>{typeof title === "string" ? tx(title) : title}</Txt>
        {sub ? <Txt style={{ fontSize: 13, color: C.muted }} numberOfLines={2}>{typeof sub === "string" ? tx(sub) : sub}</Txt> : null}
      </View>
      {right}
    </View>
  );
  return onPress ? <Pressable onPress={onPress} style={({ pressed }) => pressed && { opacity: 0.6 }}>{body}</Pressable> : body;
}

export function Dot({ icon, tone = "info" }) {
  const map = { danger: [C.dangerTint, C.danger], warning: [C.warningTint, C.warning], info: [C.infoTint, C.info], joy: [C.marigold, "#261433"], success: [C.successTint, C.success] };
  const [bg, fg] = map[tone];
  return <View style={{ width: 40, height: 40, borderRadius: 13, backgroundColor: bg, alignItems: "center", justifyContent: "center" }}><Icon name={icon} size={20} color={fg} /></View>;
}

export function Fab({ onPress, label }) {
  const insets = useSafeAreaInsets();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label}
      style={({ pressed }) => [s.fab, { bottom: 18 + (insets.bottom ? 0 : 0), transform: [{ scale: pressed ? 0.94 : 1 }] }]}>
      <Icon name="plus" size={26} color="#261433" stroke={2.6} />
    </Pressable>
  );
}

export function Empty({ icon = "folder", title, text, action }) {
  return (
    <Card style={{ alignItems: "center", gap: 10, paddingVertical: 32 }}>
      <Dot icon={icon} tone="joy" />
      <Txt variant="h3" style={{ textAlign: "center" }}>{title}</Txt>
      <Txt style={{ color: C.muted, textAlign: "center" }}>{text}</Txt>
      {action}
    </Card>
  );
}

const build = () => ({
  body: { fontFamily: F.body, fontSize: 15, lineHeight: 21, color: C.ink },
  h1: { fontFamily: F.display, fontSize: 32, lineHeight: 36, color: C.ink, letterSpacing: -0.8 },
  h2: { fontFamily: F.displayBold, fontSize: 22, lineHeight: 27, color: C.ink, letterSpacing: -0.4 },
  h3: { fontFamily: F.displayBold, fontSize: 18, lineHeight: 23, color: C.ink },
  eyebrow: { fontFamily: F.bold, fontSize: 12, letterSpacing: 1.4, textTransform: "uppercase", color: C.marigoldText },
  eyebrowDark: { fontFamily: F.bold, fontSize: 12, letterSpacing: 1.4, textTransform: "uppercase", color: "#4A3000" },
  amount: { fontFamily: F.displayBold, fontSize: 26, lineHeight: 30, color: C.ink, fontVariant: ["tabular-nums"] },
  blobHeader: { backgroundColor: C.marigold, paddingHorizontal: 16, paddingBottom: 26, borderBottomLeftRadius: 32, borderBottomRightRadius: 32, overflow: "hidden", marginBottom: 16, gap: 16 },
  blob: { position: "absolute" },
  card: { backgroundColor: C.white, borderRadius: 22, borderWidth: 1, borderColor: C.line, padding: 16, gap: 10 },
  pill: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", height: 24, paddingHorizontal: 10, borderRadius: 999 },
  btn: { minHeight: 48, borderRadius: 999, paddingHorizontal: 22, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  btnSm: { minHeight: 38, paddingHorizontal: 14 },
  input: { minHeight: 48, borderWidth: 1, borderColor: C.lineStrong, borderRadius: 14, backgroundColor: C.white, paddingHorizontal: 14, fontFamily: F.body, fontSize: 16, color: C.ink },
  chip: { borderWidth: 1, borderColor: C.line, backgroundColor: C.white, borderRadius: 999, paddingHorizontal: 14, height: 36, justifyContent: "center" },
  toggleRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.line },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.line },
  fab: { position: "absolute", right: 18, width: 60, height: 60, borderRadius: 30, backgroundColor: C.marigold, alignItems: "center", justifyContent: "center", borderBottomWidth: 4, borderBottomColor: C.plum, elevation: 6, shadowColor: C.plum, shadowOpacity: 0.25, shadowRadius: 10, shadowOffset: { width: 0, height: 6 } },
  toast: { position: "absolute", left: 16, right: 16, backgroundColor: C.plumCard, borderRadius: 999, paddingVertical: 12, paddingHorizontal: 18, flexDirection: "row", alignItems: "center", gap: 10, elevation: 8 },
});

// Styles are rebuilt when the app switches between bright and dark
export const s = {};
const rebuild = () => Object.assign(s, StyleSheet.create(build()));
rebuild();
onScheme(rebuild);
