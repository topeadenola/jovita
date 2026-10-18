import { useEffect, useRef, useState } from "react";
import { KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, Share, TextInput, View } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useData } from "../lib/data";
import { answer, SUGGESTIONS } from "../lib/ask";
import { mailLink, waLink } from "../lib/voice";
import { Button, Txt } from "../components/ui";
import Icon from "../components/Icon";
import { AskIcon } from "../components/Jo";
import { C, F } from "../lib/theme";
import { getLang, tx } from "../lib/i18n";
import { askBrain, brainOff, leftNote } from "../lib/brain";
import { useActions } from "../lib/actions";
import { addDays, first, money, PROJECT_TYPES } from "../lib/format";

const LANG_NAME = { en: "English", fr: "French", es: "Spanish", pt: "Portuguese", sw: "Swahili" };
const PAGES = { today: "/", clients: "/clients", projects: "/projects", money: "/money", inbox: "/inbox", bookings: "/bookings", galleries: "/galleries", accounting: "/accounting", templates: "/templates", settings: "/settings" };
const uid = () => Math.random().toString(36).slice(2, 9);

// Turn what the brain suggests into drafts and tap-to-confirm buttons
function fromBrain(actions = [], data, invoiceAction) {
  const { clients = [], invoices = [], studio, insert } = data;
  const drafts = [];
  const buttons = [];
  const findC = (a) => clients.find((c) => c.id === a.client_id) || clients.find((c) => a.client_name && c.name.toLowerCase().includes(String(a.client_name).toLowerCase()));
  const ensure = async (a) => findC(a) || insert("clients", { name: a.client_name, email: "", phone: "", city: "", status: "client" });
  const cur = (c) => (["NGN", "GBP", "USD"].includes(c) ? c : studio.home_currency);
  for (const { tool, input: a = {} } of actions) {
    if (tool === "draft_message") {
      const c = clients.find((x) => x.id === a.client_id);
      if (c && a.text) drafts.push({ to: c.name, phone: a.channel === "email" ? "" : c.phone, email: a.channel === "whatsapp" ? "" : c.email, subject: a.subject || "", text: a.text });
    } else if (tool === "create_client" && a.name) {
      buttons.push({ label: tx("Add {name}", { name: a.name }), primary: true, run: async () => { const c = await insert("clients", { name: a.name, email: a.email || "", phone: a.phone || "", city: "", status: a.status || "client" }); router.push(`/client/${c.id}`); return tx("Done. {name} is now in your clients.", { name: a.name }); } });
    } else if (tool === "create_invoice" && (a.client_id || a.client_name)) {
      buttons.push({ label: tx("Create the draft invoice"), primary: true, run: async () => {
        const c = await ensure(a);
        const items = (a.items || []).map((it) => ({ id: uid(), name: it.name || "", description: it.description || "", qty: Number(it.qty ?? 1) || 1, price: Number(it.price) || 0 }));
        const amount = items.reduce((s, it) => s + it.qty * it.price, 0);
        const inv = await insert("invoices", { client_id: c.id, label: a.label || tx("Invoice"), amount, currency: cur(a.currency), due_date: addDays(14), status: "draft", items });
        return tx("Created draft invoice #{number} for {name}{amount}. It's open now: check it, then press Send.", { number: inv.number || "", name: first(c.name), amount: amount ? " (" + money(amount, inv.currency) + ")" : "" }).replace(/ It's open now.*$/, "");
      } });
    } else if (tool === "create_project" && (a.client_id || a.client_name)) {
      buttons.push({ label: tx("Create the project"), primary: true, run: async () => {
        const c = await ensure(a);
        const type = PROJECT_TYPES.find((t) => t.toLowerCase() === String(a.type || "").toLowerCase()) || "Portrait";
        const date = /^\d{4}-\d{2}-\d{2}$/.test(a.session_date || "") ? a.session_date : null;
        const pr = await insert("projects", { client_id: c.id, title: a.title || tx("{type} session", { type: tx(type) }), type, stage: date ? "booked" : "inquiry", amount: Number(a.amount) || 0, currency: cur(a.currency), session_date: date });
        router.push(`/project/${pr.id}`);
        return tx("Created the project \"{title}\" for {name}. Add the date and price on the project.", { title: pr.title, name: first(c.name) });
      } });
    } else if (tool === "create_gallery" && (a.client_id || a.client_name)) {
      buttons.push({ label: tx("Create the gallery"), primary: true, run: async () => { const c = await ensure(a); const g = await insert("galleries", { client_id: c.id, title: a.title || tx("Photo session"), status: "draft" }); return tx("Created the gallery \"{title}\". It's open now: drop in the photos, then publish and invite {name}.", { title: g.title, name: first(c.name) }).replace(/ It's open now.*$/, ""); } });
    } else if (tool === "send_invoice" || tool === "mark_paid") {
      const i = invoices.find((x) => x.id === a.invoice_id);
      if (!i) continue;
      if (tool === "send_invoice" && i.status === "draft") buttons.push({ label: tx("Send invoice #{number}", { number: i.number }), primary: true, run: async () => { await invoiceAction(i, "send"); return tx("Sent. Invoice #{number} is on the client's page.", { number: i.number }); } });
      if (tool === "mark_paid" && i.status === "sent") buttons.push({ label: tx("Mark #{number} as paid", { number: i.number }), primary: true, run: async () => { await invoiceAction(i, "markpaid"); return tx("Done. Invoice #{number} is marked paid.", { number: i.number }); } });
    } else if (tool === "open_page" && PAGES[a.page]) {
      buttons.push({ label: tx("Open {page}", { page: tx(a.page.charAt(0).toUpperCase() + a.page.slice(1)) }), run: async () => { router.push(PAGES[a.page]); return null; } });
    }
  }
  if (buttons.some((b) => b.primary)) buttons.push({ label: tx("Not now"), run: async () => tx("Okay, nothing changed.") });
  return { drafts, buttons };
}

function Bubble({ me, children }) {
  return (
    <View style={{ alignSelf: me ? "flex-end" : "flex-start", maxWidth: "88%", backgroundColor: me ? C.plumCard : C.surface, borderWidth: me ? 0 : 1, borderColor: C.line,
      paddingVertical: 12, paddingHorizontal: 16, borderRadius: 18, borderBottomRightRadius: me ? 6 : 18, borderBottomLeftRadius: me ? 18 : 6 }}>
      <Txt style={{ color: me ? "#FFFFFF" : C.ink, fontFamily: F.semi }}>{children}</Txt>
    </View>
  );
}

function Draft({ d }) {
  const wa = waLink(d.phone, d.text);
  const mail = mailLink(d.email, d.subject, d.text);
  return (
    <View style={{ maxWidth: "94%", backgroundColor: C.surface, borderWidth: 1, borderColor: C.line, borderRadius: 18, borderBottomLeftRadius: 6, padding: 14, gap: 8 }}>
      <Txt style={{ fontSize: 12, fontFamily: F.bold, color: C.muted }}>{tx("To {name} · in your voice", { name: d.to })}</Txt>
      <Txt style={{ fontSize: 14, lineHeight: 20 }}>{d.text}</Txt>
      <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
        {mail ? <Button small variant="secondary" title={tx("Email")} onPress={() => Linking.openURL(mail).catch(() => {})} /> : null}
        <Button small variant="ghost" title={tx("Share")} onPress={() => Share.share({ message: d.text }).catch(() => {})} />
      </View>
    </View>
  );
}

export default function Ask() {
  const data = useData();
  const insets = useSafeAreaInsets();
  const [log, setLog] = useState([{ who: "jo", text: data.studio?.owner_first_name ? tx("Hi {name}! I'm Jovita, your assistant. What do you need help with today?", { name: data.studio.owner_first_name }) : tx("Hi! I'm Jovita, your assistant. What do you need help with today?"), chips: SUGGESTIONS }]);
  const [text, setText] = useState("");
  const [thinking, setThinking] = useState(false);
  const scroll = useRef(null);
  const { invoiceAction } = useActions();
  useEffect(() => { setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 50); }, [log, thinking]);

  const ask = (q) => {
    const s = q.trim();
    if (!s || thinking || !data.studio) return;
    setText("");
    setLog((l) => [...l.map((m) => (m.buttons ? { ...m, buttons: m.buttons.map((b) => ({ ...b, stale: true })) } : m)), { who: "me", text: s }]);
    setThinking(true);
    const rules = (note) => setLog((l) => [...l, ...(note ? [{ who: "jo", text: note }] : []), { who: "jo", ...answer(s, data) }]);
    if (brainOff()) { setTimeout(() => { rules(); setThinking(false); }, 450); return; }
    askBrain([...log, { who: "me", text: s }], { lang: LANG_NAME[getLang()] || "English", smart: s.length > 280 }).then((r) => {
      setThinking(false);
      if (r.error === "limit") {
        setLog((l) => [...l, { who: "jo", text: r.message + " " + tx("Upgrade to keep using everything Jovita can do. Here's a basic answer for now:"), buttons: [{ label: tx("See plans"), primary: true, run: async () => { router.push("/plan"); return null; } }] }]);
        return rules();
      }
      if (!r.ok) return rules(["slow_down", "suspended"].includes(r.error) ? r.message + " " + tx("Here's what I can do without it:") : "");
      const { drafts, buttons } = fromBrain(r.actions, data, invoiceAction);
      setLog((l) => [...l, { who: "jo", text: r.text + leftNote(r.quota), drafts, buttons }]);
    });
  };
  const press = async (i, b) => {
    if (b.stale || thinking) return;
    setLog((l) => l.map((m, k) => (k === i ? { ...m, buttons: m.buttons.map((x) => ({ ...x, stale: true, chosen: x === b })) } : m)));
    setThinking(true);
    try { const t = await b.run(); if (t) setLog((l) => [...l, { who: "jo", text: t }]); }
    catch (e) { setLog((l) => [...l, { who: "jo", text: tx("That didn't work: {err}", { err: e.message }) }]); }
    finally { setThinking(false); }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: C.paper }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={{ paddingTop: insets.top + 8, paddingHorizontal: 12, paddingBottom: 12, flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: C.surface, borderBottomWidth: 1, borderBottomColor: C.line }}>
        <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel={tx("Back")} style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}>
          <Icon name="back" size={22} />
        </Pressable>
        <AskIcon state={thinking ? "typing" : "smile"} size={36} />
        <View><Txt style={{ fontFamily: F.displayBold, fontSize: 20, lineHeight: 24 }}>{tx("Ask Jovita")}</Txt><Txt style={{ fontSize: 12, color: C.muted }}>{tx("Only acts when you ask")}</Txt></View>
      </View>
      <ScrollView ref={scroll} contentContainerStyle={{ padding: 16, gap: 12 }} keyboardShouldPersistTaps="handled">
        {log.map((m, i) => (
          <View key={i} style={{ gap: 10 }}>
            <Bubble me={m.who === "me"}>{m.text}</Bubble>
            {m.drafts?.map((d, j) => <Draft key={j} d={d} />)}
            {m.buttons?.length ? (
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {m.buttons.map((b, j) => <Button key={j} small variant={b.chosen || (b.primary && !b.stale) ? "primary" : "secondary"} disabled={b.stale} title={b.label} onPress={() => press(i, b)} />)}
              </View>
            ) : null}
            {m.chips && i === log.length - 1 ? (
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {m.chips.map((c) => (
                  <Pressable key={c} onPress={() => ask(tx(c))} accessibilityRole="button" style={{ borderWidth: 1, borderColor: C.line, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 }}>
                    <Txt style={{ fontSize: 13, fontFamily: F.semi }}>{tx(c)}</Txt>
                  </Pressable>
                ))}
              </View>
            ) : null}
          </View>
        ))}
        {thinking ? <Bubble>…</Bubble> : null}
      </ScrollView>
      <View style={{ padding: 12, paddingBottom: insets.bottom + 12, gap: 8, backgroundColor: C.surface, borderTopWidth: 1, borderTopColor: C.line }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, minHeight: 48, paddingLeft: 14, paddingRight: 6, borderWidth: 1, borderColor: C.lineStrong, borderRadius: 14 }}>
          <TextInput value={text} onChangeText={setText} onSubmitEditing={() => ask(text)} placeholder={tx("Ask anything")} placeholderTextColor={C.lineStrong} returnKeyType="send"
            accessibilityLabel={tx("Message Ask Jovita")} style={{ flex: 1, fontFamily: F.body, fontSize: 16, color: C.ink, minHeight: 44 }} />
          <Pressable onPress={() => ask(text)} accessibilityRole="button" accessibilityLabel={tx("Send")} style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: C.action, alignItems: "center", justifyContent: "center" }}>
            <Icon name="send" size={18} color={C.onAction} />
          </Pressable>
        </View>
        <Txt style={{ fontSize: 12, color: C.muted }}>{tx("Jovita drafts messages for you to send. It never sends anything or touches money on its own.")}</Txt>
      </View>
    </KeyboardAvoidingView>
  );
}
