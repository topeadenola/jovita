import { View } from "react-native";
import { router } from "expo-router";
import { supabase } from "../../lib/supabase";
import { useData } from "../../lib/data";
import Icon, { Mark } from "../../components/Icon";
import { Card, PageTitle, Row, Screen, Txt } from "../../components/ui";
import { C } from "../../lib/theme";
import { tx, txn } from "../../lib/i18n";

export default function More() {
  const { studio, messages, session } = useData();
  const unread = messages.filter((m) => m.from_client && !m.read).length;
  const items = [
    ["chart", "Accounting", "Profit, expenses and subscriptions", "/accounting"],
    ["users", "Clients", "Everyone you work with", "/clients"],
    ["calendar", "Bookings", "Sessions and session types", "/bookings"],
    ["image", "Galleries", "Deliver and extend galleries", "/galleries"],
    ["file", "Templates", "Contracts, model releases, invoices, emails", "/templates"],
    ["settings", "Settings", "Studio, currency, reminders", "/settings"],
    ["wallet", "Payments", "Connect Paystack, Flutterwave, PayPal, bank", "/payments"],
    ["star", "Plan", "See plans, try Pro free or upgrade", "/plan"],
  ];
  return (
    <Screen header={<PageTitle eyebrow={studio?.name} title={tx("More")} />}>
      <Card style={{ paddingVertical: 4 }}>
        {items.map(([icon, title, sub, href], ix) => (
          <Row key={href} last={ix === items.length - 1} onPress={() => router.push(href)} title={title} sub={sub}
            left={<View style={{ width: 40, height: 40, borderRadius: 13, backgroundColor: ix % 2 ? C.lilac : C.marigold, alignItems: "center", justifyContent: "center" }}><Icon name={icon} size={20} /></View>}
            right={<Icon name="chevron" size={18} color={C.muted} />} />
        ))}
      </Card>
      <Card style={{ paddingVertical: 4 }}>
        <Row last onPress={() => supabase.auth.signOut()} title={tx("Sign out")} sub={session?.user?.email}
          left={<View style={{ width: 40, height: 40, borderRadius: 13, backgroundColor: C.sunken, alignItems: "center", justifyContent: "center" }}><Icon name="logout" size={20} /></View>} />
      </Card>
      <View style={{ alignItems: "center", gap: 6, paddingTop: 12 }}>
        <Mark size={30} />
        <Txt style={{ color: C.muted, fontSize: 12 }}>{tx("Jovita · Run your creative business with joy.")}</Txt>
      </View>
    </Screen>
  );
}
