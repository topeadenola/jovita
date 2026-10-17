import { useState } from "react";
import { Pressable, View } from "react-native";
import { router } from "expo-router";
import { useData } from "../../lib/data";
import { STAGES, STAGE_LABEL, fdate, first, money, nextStep, projPill } from "../../lib/format";
import { Avatar, Chips, Empty, Fab, PageTitle, Pill, Screen, Txt, Button } from "../../components/ui";
import { C, F } from "../../lib/theme";
import { tx } from "../../lib/i18n";

export default function Projects() {
  const { projects, client } = useData();
  const [stage, setStage] = useState("all");
  const list = projects.filter((p) => stage === "all" || p.stage === stage);
  const opts = [["all", `All ${projects.length}`], ...STAGES.map((s) => [s, `${STAGE_LABEL[s]} ${projects.filter((p) => p.stage === s).length}`])];
  return (
    <View style={{ flex: 1 }}>
      <Screen header={<PageTitle eyebrow={tx("Projects")} title={tx("Your pipeline")} />}>
        {!projects.length ? (
          <Empty title={tx("No projects yet")} text={tx("A project holds the contract, invoices and gallery for one job.")} action={<Button title={tx("New project")} onPress={() => router.push("/new/project")} />} />
        ) : (
          <>
            <Chips options={opts} value={stage} onChange={setStage} />
            {list.map((p) => {
              const c = client(p.client_id); const pl = projPill(p); const n = nextStep(p);
              return (
                <Pressable key={p.id} onPress={() => router.push(`/project/${p.id}`)} style={({ pressed }) => [{ backgroundColor: C.surface, borderRadius: 22, borderWidth: 1, borderColor: C.line, padding: 16, gap: 10 }, pressed && { transform: [{ scale: 0.98 }] }]}>
                  <View style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
                    <Avatar name={c.name} />
                    <View style={{ flex: 1 }}>
                      <Txt variant="h3" numberOfLines={1}>{tx("{name}'s {title}", { name: first(c.name), title: p.title.toLowerCase() })}</Txt>
                      <Txt style={{ fontSize: 13, color: C.muted }}>{tx(p.type)} · {fdate(p.session_date)}{c.city ? ` · ${c.city}` : ""}</Txt>
                    </View>
                  </View>
                  <Pill c={pl.c}>{pl.k}</Pill>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", borderTopWidth: 1, borderTopColor: C.line, paddingTop: 10 }}>
                    <Txt style={{ fontFamily: F.displayBold }}>{money(p.amount, p.currency)}</Txt>
                    <Txt style={{ fontFamily: F.bold, fontSize: 13, color: C.marigoldText }}>{n.t} →</Txt>
                  </View>
                </Pressable>
              );
            })}
            {!list.length && <Txt style={{ color: C.muted }}>{tx("Nothing in this stage.")}</Txt>}
          </>
        )}
      </Screen>
      <Fab label={tx("New project")} onPress={() => router.push("/new/project")} />
    </View>
  );
}
