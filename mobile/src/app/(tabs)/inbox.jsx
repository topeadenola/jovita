import { useMemo } from "react";
import { router } from "expo-router";
import { useData } from "../../lib/data";
import { ago } from "../../lib/format";
import { Avatar, Card, Empty, PageTitle, Pill, Row, Screen, Txt } from "../../components/ui";
import { View } from "react-native";
import { C, F } from "../../lib/theme";
import { tx } from "../../lib/i18n";

const CH = { email: "Email", whatsapp: "WhatsApp", portal: "Portal" };

export default function Inbox() {
  const { messages, client } = useData();
  const threads = useMemo(() => {
    const by = {};
    [...messages].sort((a, b) => (a.created_at < b.created_at ? -1 : 1)).forEach((m) => { (by[m.client_id] ||= []).push(m); });
    return Object.entries(by).map(([cid, msgs]) => ({ cid, last: msgs[msgs.length - 1], unread: msgs.filter((m) => m.from_client && !m.read).length }))
      .sort((a, b) => (a.last.created_at < b.last.created_at ? 1 : -1));
  }, [messages]);
  const head = <PageTitle eyebrow={tx("Inbox")} title={tx("Messages")} />;
  if (!threads.length) return <Screen header={head}><Empty icon="inbox" title={tx("No messages yet")} text={tx("Messages your clients send from their portal land here.")} /></Screen>;
  const TAG = { whatsapp: [C.successTint, C.success], email: [C.infoTint, C.info], portal: [C.warningTint, C.warning] };
  return (
    <Screen header={head}>
      <Card style={{ paddingVertical: 4 }}>
        {threads.map((t, ix) => (
          <Row key={t.cid} last={ix === threads.length - 1} onPress={() => router.push(`/thread/${t.cid}`)} left={<Avatar name={client(t.cid).name} tone={t.unread ? "mari" : undefined} />}
            title={`${client(t.cid).name} · ${ago(t.last.created_at)}`} sub={t.last.body}
            right={t.unread ? <Pill c="p-joy">{tx("{unread} new", {
              unread: t.unread
            })}</Pill> : <View style={{ backgroundColor: (TAG[t.last.channel] || TAG.portal)[0], borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 }}><Txt style={{ fontSize: 12, fontFamily: F.bold, color: (TAG[t.last.channel] || TAG.portal)[1] }}>{tx(CH[t.last.channel])}</Txt></View>} />
        ))}
      </Card>
    </Screen>
  );
}
