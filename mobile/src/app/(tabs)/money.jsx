import { useState } from "react";
import { Switch, View } from "react-native";
import { router } from "expo-router";
import { useData } from "../../lib/data";
import { useActions } from "../../lib/actions";
import { fdate, invState, money, totalLine, totalsBy } from "../../lib/format";
import { Button, Card, Chips, Empty, Fab, PageTitle, Pill, Screen, ToggleRow, Txt, useToast } from "../../components/ui";
import { C, F } from "../../lib/theme";
import { tx } from "../../lib/i18n";
import { receipts } from "../../lib/accounting";

// Long amounts (e.g. 1 670 000 F CFA) step down a size instead of being cut off
const fit = (v) => { const n = String(v).length; return n > 12 ? { fontSize: 17, lineHeight: 22 } : n > 8 ? { fontSize: 20, lineHeight: 25 } : null; };
const TABS = ["All", "Overdue", "Due soon", "Check payment", "Sent", "Paid", "Draft"];

export default function Money() {
  const { invoices, studio, client, project, updateStudio } = useData();
  const { invoiceAction } = useActions();
  const toast = useToast();
  const [tab, setTab] = useState("All");
  if (!studio) return null;
  const home = studio.home_currency;
  const list = invoices.filter((i) => tab === "All" || invState(i).k === tab).sort((a, b) => b.number - a.number);
  const paid = totalLine(totalsBy(invoices.flatMap(receipts)), home); // includes part payments
  const late = totalLine(totalsBy(invoices.filter((i) => invState(i).k === "Overdue")), home);
  const upcoming = totalLine(totalsBy(invoices.filter((i) => i.status === "sent" && invState(i).k !== "Overdue")), home);

  return (
    <View style={{ flex: 1 }}>
      <Screen header={<PageTitle eyebrow={tx("Money")} title={tx("Invoices")} />}>
        <View style={{ flexDirection: "row", gap: 10 }}>
          <Card tone="mari" style={{ flex: 1, gap: 2 }}><Txt style={{ fontSize: 12, fontFamily: F.semi, color: "#261433" }}>{tx("Paid")}</Txt><Txt variant="amount" style={[fit(paid.main), { color: "#261433" }]} numberOfLines={1} adjustsFontSizeToFit>{paid.main}</Txt><Txt style={{ fontSize: 11, color: "#4A3000" }} numberOfLines={1}>{paid.others}</Txt></Card>
          <Card style={{ flex: 1, gap: 2 }}><Txt style={{ fontSize: 12, fontFamily: F.semi, color: C.danger }}>{tx("Overdue")}</Txt><Txt variant="amount" style={fit(late.main)} numberOfLines={1} adjustsFontSizeToFit>{late.main}</Txt><Txt style={{ fontSize: 11, color: C.muted }} numberOfLines={1}>{late.others}</Txt></Card>
        </View>
        <Card style={{ gap: 2 }}><Txt style={{ fontSize: 12, fontFamily: F.semi, color: C.info }}>{tx("Upcoming")}</Txt><Txt variant="amount">{upcoming.main}</Txt><Txt style={{ fontSize: 12, color: C.muted }}>{upcoming.others}</Txt></Card>
        <Card tone="lilac" style={{ paddingVertical: 4 }}>
          <ToggleRow title={tx("Automatic reminders")} sub={tx("Friendly nudges before and after due dates")} value={studio.reminders_on}
            onChange={async (v) => { try { await updateStudio({ reminders_on: v }); toast(tx("Reminders {v0}", {
              v0: v ? "on" : tx("off")
            })); } catch (e) { toast(e.message); } }} />
        </Card>
        {!invoices.length ? <Empty icon="receipt" title={tx("No invoices yet")} text={tx("Create one from a template or from any project.")} action={<Button title={tx("New invoice")} onPress={() => router.push("/new/invoice")} />} /> : (
          <>
            <Chips options={TABS.map((t) => [t, t])} value={tab} onChange={setTab} />
            {list.map((i) => {
              const st = invState(i); const c = client(i.client_id); const p = i.project_id && project(i.project_id);
              return (
                <Card key={i.id}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 10 }}>
                    <View style={{ flex: 1 }}>
                      <Txt style={{ fontFamily: F.bold }}>{c.name}</Txt>
                      <Txt style={{ fontSize: 13, color: C.muted }}>#{i.number} · {i.label}{p ? ` · ${p.title}` : ""}</Txt>
                    </View>
                    <Txt style={{ fontFamily: F.displayBold, fontSize: 17 }}>{money(i.amount, i.currency)}</Txt>
                  </View>
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                    <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
                      <Pill c={st.c}>{tx(st.k)}{st.late ? ` · ${tx("{n}d", { n: st.late })}` : ""}</Pill>
                      <Txt style={{ fontSize: 12, color: C.muted }}>{i.status === "paid" ? tx("Paid {fdate}", {
                        fdate: fdate(i.paid_at)
                      }) : tx("Due {fdate}", {
                        fdate: fdate(i.due_date)
                      })}</Txt>
                    </View>
                    <View style={{ flexDirection: "row", gap: 6 }}>
                      {i.status === "draft" && <Button small title={tx("Send")} icon="send" onPress={() => invoiceAction(i, "send")} />}
                      {i.status === "sent" && st.k !== "Sent" && <Button small variant="secondary" title={tx("Nudge")} onPress={() => invoiceAction(i, "nudge")} />}
                      {i.status === "sent" && <Button small variant="ghost" title={tx("Mark paid")} icon="check" onPress={() => invoiceAction(i, "markpaid")} />}
                    </View>
                  </View>
                  {(i.status === "sent" || i.status === "draft") && (
                    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingTop: 10, borderTopWidth: 1, borderTopColor: C.line }}>
                      <Txt style={{ fontSize: 13, color: C.muted }}>{studio.reminders_on && (i.reminders_on ?? true) ? tx("Reminders on") : tx("Reminders off")}</Txt>
                      <Switch value={!!studio.reminders_on && (i.reminders_on ?? true)} onValueChange={() => (studio.reminders_on ? invoiceAction(i, "reminders") : toast(tx("Turn on automatic reminders above first.")))}
                        trackColor={{ true: C.toggleOn, false: C.lineStrong }} thumbColor={studio.reminders_on && (i.reminders_on ?? true) ? C.knobOn : "#FFFFFF"} accessibilityLabel={tx("Reminders for invoice #{number}", { number: i.number })} />
                    </View>
                  )}
                </Card>
              );
            })}
            {!list.length && <Txt style={{ color: C.muted }}>{tx("No invoices here.")}</Txt>}
          </>
        )}
      </Screen>
      <Fab label={tx("New invoice")} onPress={() => router.push("/new/invoice")} />
    </View>
  );
}
