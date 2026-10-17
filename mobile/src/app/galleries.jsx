import { View } from "react-native";
import { useData } from "../lib/data";
import { addDays, fdate, first } from "../lib/format";
import { Button, Card, Empty, Pill, Screen, Txt, useToast } from "../components/ui";
import { C } from "../lib/theme";
import { tx } from "../lib/i18n";

const TONES = [["#C9A27E", "#8C5A3C", "#D9C3B0"], ["#B88A6A", "#3E2A24", "#C9A27E"], ["#3E2A24", "#6E4B3A", "#D9C3B0"]];

export default function Galleries() {
  const { galleries, client, update } = useData();
  const toast = useToast();
  if (!galleries.length) return <Screen><Empty icon="image" title={tx("No galleries yet")} text={tx("Create galleries from the web app, then deliver them from here.")} /></Screen>;
  return (
    <Screen>
      {galleries.map((g, ix) => {
        const t = TONES[ix % TONES.length];
        const pc = g.status === "delivered" ? "p-success" : g.status === "proofing" ? "p-info" : "p-neutral";
        return (
          <Card key={g.id} style={{ padding: 0, overflow: "hidden" }}>
            <View style={{ flexDirection: "row", height: 120, gap: 3 }}>
              <View style={{ flex: 2, backgroundColor: t[0] }} />
              <View style={{ flex: 1, gap: 3 }}><View style={{ flex: 1, backgroundColor: t[1] }} /><View style={{ flex: 1, backgroundColor: t[2] }} /></View>
            </View>
            <View style={{ padding: 16, gap: 8 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                <Txt variant="h3" style={{ flex: 1 }}>{g.title}</Txt><Pill c={pc}>{g.status[0].toUpperCase() + g.status.slice(1)}</Pill>
              </View>
              <Txt style={{ color: C.muted, fontSize: 13 }}>{client(g.client_id).name}· {g.photo_count}{" "}{tx("photos")}{g.expires_on ? tx(" · open until {fdate}", {
                  fdate: fdate(g.expires_on)
                }) : ""}</Txt>
              {g.status !== "delivered"
                ? <Button small title={tx("Deliver")} icon="send" onPress={async () => {
                    await update("galleries", g.id, { status: "delivered", expires_on: addDays(30) });
                    if (g.project_id) await update("projects", g.project_id, { gallery_delivered: true, stage: "delivered" });
                    toast(tx("Delivered to {first}", {
                      first: first(client(g.client_id).name)
                    }));
                  }} />
                : <Button small variant="secondary" title={tx("Extend 30 days")} onPress={async () => { await update("galleries", g.id, { expires_on: addDays(30) }); toast(tx("Open until {fdate}", {
                fdate: fdate(addDays(30))
              })); }} />}
            </View>
          </Card>
        );
      })}
      <Txt style={{ color: C.muted, fontSize: 12 }}>{tx("Coloured tiles stand in for photos until uploads are switched on.")}</Txt>
    </Screen>
  );
}
