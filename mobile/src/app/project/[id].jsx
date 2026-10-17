import { useState } from "react";
import { Linking, View } from "react-native";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { useData } from "../../lib/data";
import { useActions } from "../../lib/actions";
import { STAGES, STAGE_LABEL, first, fday, invState, money, nextStep, portalUrl, projPill } from "../../lib/format";
import Icon from "../../components/Icon";
import { Avatar, Button, Card, Chips, Pill, Row, Screen, Txt, useToast } from "../../components/ui";
import { C, F } from "../../lib/theme";
import { tx } from "../../lib/i18n";

export default function ProjectScreen() {
  const { id } = useLocalSearchParams();
  const { project, client, invoices, templates, update, remove, loading } = useData();
  const { projectAction, invoiceAction, shareLink } = useActions();
  const toast = useToast();
  const [confirm, setConfirm] = useState(false);
  const p = project(id);
  if (loading) return <Screen><Txt>{tx("Loading…")}</Txt></Screen>;
  if (!p) return <Screen><Txt>{tx("This project was deleted.")}</Txt></Screen>;
  const c = client(p.client_id);
  const n = nextStep(p); const pl = projPill(p);
  const inv = invoices.filter((i) => i.project_id === p.id);
  const contract = templates.find((t) => t.id === p.contract_template_id);
  const release = templates.find((t) => t.id === p.release_template_id);
  const steps = [
    [tx("Inquiry and quote"), p.stage !== "inquiry", p.stage !== "inquiry" ? tx("Quote accepted") : tx("Share the quote link")],
    [tx("Contract signed"), p.contract_signed, p.contract_signed ? tx("Signed by {name}", { name: p.contract_signed_name || c.name }) : contract ? contract.name : tx("No contract")],
    ...(release ? [[tx("Model release"), p.release_signed, p.release_signed ? tx("Signed by {name}", { name: p.release_signed_name }) : tx("Optional, in the portal")]] : []),
    [tx("Deposit paid"), p.deposit_paid, p.deposit_paid ? tx("Received") : tx("Waiting")],
    [tx("Session"), ["editing", "delivered"].includes(p.stage), fday(p.session_date)],
    [tx("Gallery delivered"), p.gallery_delivered, p.gallery_delivered ? tx("Delivered") : tx("After editing")],
  ];
  const firstOpen = steps.findIndex((s) => !s[1]);
  const set = async (patch, msg) => { try { await update("projects", p.id, patch); if (msg) toast(msg); } catch (e) { toast(e.message); } };

  return (
    <Screen>
      <Stack.Screen options={{ title: p.title }} />
      <View style={{ gap: 6 }}>
        <Txt variant="eyebrow">{tx(p.type)} · {tx(STAGE_LABEL[p.stage])}</Txt>
        <Txt variant="h1">{tx("{name}'s {title}", { name: first(c.name), title: p.title.toLowerCase() })}</Txt>
        <Txt style={{ color: C.muted }}>{fday(p.session_date)}{c.city ? ` · ${c.city}` : ""}</Txt>
        <View style={{ flexDirection: "row", gap: 8, marginTop: 4 }}><Pill c={pl.c}>{pl.k}</Pill><Pill c="p-neutral">{money(p.amount, p.currency)}</Pill></View>
      </View>
      <Card tone="mari">
        <Txt variant="eyebrowDark">{tx("Next step")}</Txt>
        <Txt variant="h2">{n.t}</Txt>
        <Button title={n.t} onPress={() => projectAction(p, n.a)} />
      </Card>
      <Card>
        <Txt variant="h2">{tx("Progress")}</Txt>
        {steps.map((s, ix) => (
          <View key={s[0]} style={{ flexDirection: "row", gap: 12, alignItems: "flex-start", paddingVertical: 6 }}>
            <View style={{ width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: s[1] ? C.success : ix === firstOpen ? C.marigold : "transparent", borderWidth: s[1] || ix === firstOpen ? 0 : 2, borderColor: C.lineStrong }}>
              {s[1] ? <Icon name="check" size={16} color="#FFFFFF" stroke={3} /> : <Txt style={{ fontFamily: F.bold, fontSize: 12 }}>{ix + 1}</Txt>}
            </View>
            <View style={{ flex: 1 }}><Txt style={{ fontFamily: F.semi }}>{s[0]}</Txt><Txt style={{ fontSize: 13, color: C.muted }}>{s[2]}</Txt></View>
          </View>
        ))}
        <Txt style={{ fontFamily: F.semi, fontSize: 13, marginTop: 4 }}>{tx("Move to stage")}</Txt>
        <Chips options={STAGES.map((s) => [s, tx(STAGE_LABEL[s])])} value={p.stage} onChange={(s) => set({ stage: s }, tx("Moved to {stage}", { stage: tx(STAGE_LABEL[s]) }))} />
      </Card>
      <Card tone="lilac">
        <Txt variant="h2">{tx("Client portal")}</Txt>
        <Txt>{tx("One link where")}{" "}{first(c.name)}{" "}{tx("signs, pays and sees the gallery. No account needed.")}</Txt>
        <Txt selectable style={{ fontSize: 12, color: C.muted }}>{portalUrl(p.portal_token)}</Txt>
        <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
          <Button small title={tx("Share link")} icon="share" onPress={() => shareLink(p, "Quote")} />
          <Button small variant="secondary" title={tx("Open portal")} icon="eye" onPress={() => Linking.openURL(portalUrl(p.portal_token))} />
        </View>
      </Card>
      <Card>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Txt variant="h2">{tx("Invoices")}</Txt>
          <Button small variant="ghost" icon="plus" title={tx("New")} onPress={() => router.push({ pathname: "/new/invoice", params: { project: p.id } })} />
        </View>
        {inv.map((i, ix) => {
          const st = invState(i);
          return (
            <Row key={i.id} last={ix === inv.length - 1} title={`#${i.number} · ${money(i.amount, i.currency)}`} sub={i.label}
              right={<View style={{ alignItems: "flex-end", gap: 6 }}><Pill c={st.c}>{st.k}</Pill>
                {i.status === "sent" && <Button small variant="ghost" title={tx("Mark paid")} onPress={() => invoiceAction(i, "markpaid")} />}
                {i.status === "draft" && <Button small variant="ghost" title={tx("Send")} onPress={() => invoiceAction(i, "send")} />}</View>} />
          );
        })}
        {!inv.length && <Txt style={{ color: C.muted }}>{tx("No invoices yet.")}</Txt>}
      </Card>
      <Card>
        <Txt variant="h2">{tx("Client")}</Txt>
        <Row last onPress={() => router.push(`/client/${c.id}`)} left={<Avatar name={c.name} />} title={c.name} sub={[c.phone, c.email].filter(Boolean).join(" · ")} right={<Icon name="chevron" size={18} color={C.muted} />} />
      </Card>
      {confirm ? (
        <Card style={{ borderColor: C.danger }}>
          <Txt>{tx("Delete this project? Its invoices stay but lose the link.")}</Txt>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Button small variant="ghost" title={tx("Keep it")} onPress={() => setConfirm(false)} />
            <Button small variant="danger" title={tx("Delete project")} onPress={async () => { await remove("projects", p.id); toast(tx("Project deleted")); router.back(); }} />
          </View>
        </Card>
      ) : <Button variant="ghost" title={tx("Delete project")} onPress={() => setConfirm(true)} style={{ alignSelf: "flex-start" }} />}
    </Screen>
  );
}
