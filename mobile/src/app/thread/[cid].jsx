import { useEffect, useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, TextInput, View } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useData } from "../../lib/data";
import { ago, first } from "../../lib/format";
import { Button, Txt, useToast } from "../../components/ui";
import { C, F } from "../../lib/theme";
import { tx } from "../../lib/i18n";

export default function Thread() {
  const { cid } = useLocalSearchParams();
  const { messages, client, insert, update } = useData();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const [text, setText] = useState("");
  const ref = useRef(null);
  const c = client(cid);
  const msgs = messages.filter((m) => m.client_id === cid).sort((a, b) => (a.created_at < b.created_at ? -1 : 1));
  const channel = msgs[msgs.length - 1]?.channel || "portal";

  useEffect(() => {
    msgs.filter((m) => m.from_client && !m.read).forEach((m) => update("messages", m.id, { read: true }).catch(() => {}));
  }, [cid]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: C.paper }} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={90}>
      <Stack.Screen options={{ title: c.name }} />
      <ScrollView ref={ref} contentContainerStyle={{ padding: 16, gap: 10 }} onContentSizeChange={() => ref.current?.scrollToEnd({ animated: false })}>
        {msgs.map((m) => (
          <View key={m.id} style={{ alignSelf: m.from_client ? "flex-start" : "flex-end", maxWidth: "85%", backgroundColor: m.from_client ? C.surface : C.plumCard, borderRadius: 18, padding: 12, borderWidth: m.from_client ? 1 : 0, borderColor: C.line }}>
            <Txt style={{ color: m.from_client ? C.ink : "#FFFFFF" }}>{m.body}</Txt>
            <Txt style={{ fontSize: 11, marginTop: 4, color: m.from_client ? C.muted : "#D9CCE6" }}>{m.from_client ? first(c.name) : tx("You")} · {ago(m.created_at)}</Txt>
          </View>
        ))}
      </ScrollView>
      <View style={{ flexDirection: "row", gap: 8, padding: 12, paddingBottom: 12 + insets.bottom, borderTopWidth: 1, borderTopColor: C.line, backgroundColor: C.surface }}>
        <TextInput value={text} onChangeText={setText} placeholder={tx("Reply to {first}…", {
          first: first(c.name)
        })} placeholderTextColor={C.lineStrong} accessibilityLabel={tx("Reply")}
          style={{ flex: 1, minHeight: 44, borderWidth: 1, borderColor: C.lineStrong, borderRadius: 22, paddingHorizontal: 16, fontFamily: F.body, fontSize: 16, color: C.ink }} />
        <Button small title={tx("Send")} icon="send" onPress={async () => {
          if (!text.trim()) return;
          try { await insert("messages", { client_id: cid, channel, from_client: false, read: true, body: text.trim() }); setText(""); } catch (e) { toast(e.message); }
        }} />
      </View>
    </KeyboardAvoidingView>
  );
}
