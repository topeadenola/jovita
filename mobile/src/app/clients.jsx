import { useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { useData } from "../lib/data";
import { money } from "../lib/format";
import { Avatar, Button, Card, Chips, Empty, Fab, Field, PageTitle, Pill, Row, Screen, Txt } from "../components/ui";
import { C } from "../lib/theme";
import { tx } from "../lib/i18n";

export default function Clients() {
  const { clients, invoices } = useData();
  const [q, setQ] = useState("");
  const [tab, setTab] = useState("all");
  const ql = q.toLowerCase();
  const list = clients.filter((c) => (tab === "all" || c.status === tab) && (!ql || [c.name, c.email, c.city, c.phone].join(" ").toLowerCase().includes(ql)));
  return (
    <View style={{ flex: 1 }}>
      <Screen>
        {!clients.length ? (
          <Empty icon="users" title={tx("No clients yet")} text={tx("Add your first client to start a project.")} action={<Button title={tx("Add client")} onPress={() => router.push("/new/client")} />} />
        ) : (
          <>
            <Field placeholder={tx("Search by name, email or city")} value={q} onChangeText={setQ} autoCapitalize="none" clearButtonMode="while-editing" />
            <Chips options={[["all", "All"], ["client", "Clients"], ["lead", "Leads"]]} value={tab} onChange={setTab} />
            <Card style={{ paddingVertical: 4 }}>
              {list.map((c, ix) => {
                const owe = invoices.filter((i) => i.client_id === c.id && i.status === "sent");
                return (
                  <Row key={c.id} last={ix === list.length - 1} onPress={() => router.push(`/client/${c.id}`)} left={<Avatar name={c.name} />}
                    title={c.name} sub={owe.length ? tx("Owes {v0}", {
                    v0: owe.map((i) => money(i.amount, i.currency)).join(" + ")
                  }) : [c.city, c.phone].filter(Boolean).join(" · ")}
                    right={<Pill c={c.status === "lead" ? "p-info" : "p-neutral"}>{c.status === "lead" ? tx("Lead") : tx("Client")}</Pill>} />
                );
              })}
              {!list.length && <Txt style={{ color: C.muted, paddingVertical: 12 }}>{tx("No one matches \"")}{q}".</Txt>}
            </Card>
          </>
        )}
      </Screen>
      <Fab label={tx("Add client")} onPress={() => router.push("/new/client")} />
    </View>
  );
}
