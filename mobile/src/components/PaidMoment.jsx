import { useEffect, useState } from "react";
import { Linking, Modal, Pressable, View } from "react-native";
import Jo from "./Jo";
import { Txt } from "./ui";
import { F } from "../lib/theme";
import { useData } from "../lib/data";
import { mailLink, waLink } from "../lib/voice";
import { tx } from "../lib/i18n";

// Fire from anywhere: celebratePaid({ name, amount, label, clientId })
const listeners = new Set();
export const celebratePaid = (detail) => listeners.forEach((fn) => fn(detail));

const COLS = ["#FFB320", "#E9DDFB", "#F7A6C0", "#FFFFFF", "#E89A00"];

export default function PaidMoment() {
  const { clients = [], studio } = useData() || {};
  const [p, setP] = useState(null);
  useEffect(() => { listeners.add(setP); return () => { listeners.delete(setP); }; }, []);
  if (!p) return null;
  const c = clients.find((x) => x.id === p.clientId);
  const thanks = () => {
    const text = tx("Hi {name}! Payment received, thank you so much. It was a joy working with you.", { name: (c?.name || "").split(" ")[0] }) + (studio?.owner_first_name ? "\n" + studio.owner_first_name : "");
    const url = waLink(c?.phone, text) || mailLink(c?.email, tx("Thank you!"), text);
    if (url) Linking.openURL(url).catch(() => {});
    setP(null);
  };
  return (
    <Modal transparent animationType="fade" visible onRequestClose={() => setP(null)}>
      <View style={{ flex: 1, backgroundColor: "#261433", alignItems: "center", justifyContent: "center", padding: 24 }}>
        {Array.from({ length: 16 }, (_, i) => (
          <View key={i} style={{ position: "absolute", top: 60 + ((i * 97) % 380), left: `${(i * 53 + 7) % 94}%`, width: 6 + (i % 3) * 3, height: 10 + (i % 2) * 4, borderRadius: 3, backgroundColor: COLS[i % 5], transform: [{ rotate: `${i * 37}deg` }] }} />
        ))}
        <Jo mood="paid" size={170} />
        <Txt style={{ color: "#D9CCE6", fontFamily: F.semi, marginTop: 24 }}>{tx("{name} just paid", { name: p.name })}</Txt>
        <Txt style={{ color: "#FFB320", fontFamily: F.display, fontSize: 42, lineHeight: 48 }} adjustsFontSizeToFit numberOfLines={1}>{p.amount}</Txt>
        <Txt style={{ color: "#D9CCE6", textAlign: "center", fontSize: 14 }}>{p.label ? p.label + " · " : ""}{tx("Invoice closed. Reminders stop for you.")}</Txt>
        <View style={{ alignSelf: "stretch", gap: 10, marginTop: 40 }}>
          {c && (c.phone || c.email) ? (
            <Pressable onPress={thanks} accessibilityRole="button" style={{ minHeight: 52, borderRadius: 16, backgroundColor: "#FFB320", alignItems: "center", justifyContent: "center" }}>
              <Txt style={{ color: "#261433", fontFamily: F.bold }}>{tx("Send a thank-you")}</Txt>
            </Pressable>
          ) : null}
          <Pressable onPress={() => setP(null)} accessibilityRole="button" style={{ minHeight: 52, borderRadius: 16, borderWidth: 1, borderColor: "#7D6F8C", alignItems: "center", justifyContent: "center" }}>
            <Txt style={{ color: "#FFFFFF", fontFamily: F.bold }}>{tx("Lovely, back to work")}</Txt>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
