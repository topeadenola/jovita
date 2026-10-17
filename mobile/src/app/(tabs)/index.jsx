import { useState } from "react";
import PlanBadge from "../../components/PlanBadge";
import { ActivityIndicator, Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { useData } from "../../lib/data";
import { useActions } from "../../lib/actions";
import { loadSampleData } from "../../lib/sample";
import { daysFrom, dom, dow, fday, first, ftime, invState, money, short, totalLine, totalsBy } from "../../lib/format";
import { summary } from "../../lib/accounting";
import Icon from "../../components/Icon";
import { AskIcon } from "../../components/Jo";
import { useTheme } from "../../components/Theme";
import { BlobHeader, Button, Card, Screen, Txt, useToast } from "../../components/ui";
import { C, F } from "../../lib/theme";
import { tx, txn } from "../../lib/i18n";

function Stat({ label, value, note, tone }) {
  return (
    <View style={{ flex: 1, borderRadius: 20, padding: 14, gap: 2, backgroundColor: tone === "lilac" ? C.lilac : C.surface, borderWidth: tone === "lilac" ? 0 : 1, borderColor: C.line }}>
      <Txt style={{ fontSize: 12, fontFamily: F.semi, color: C.muted }}>{label}</Txt>
      <Txt style={{ fontFamily: F.display, fontSize: 24, lineHeight: 28 }} numberOfLines={1} adjustsFontSizeToFit>{value}</Txt>
      {note ? <Txt style={{ fontSize: 12, color: C.muted }} numberOfLines={1}>{note}</Txt> : null}
    </View>
  );
}

function AskButton() {
  return (
    <Pressable onPress={() => router.push("/ask")} accessibilityRole="button" accessibilityLabel={tx("Ask Jovita")}
      style={({ pressed }) => ({ position: "absolute", right: 16, bottom: 16, flexDirection: "row", alignItems: "center", gap: 8, minHeight: 52, paddingVertical: 6, paddingLeft: 6, paddingRight: 18, borderRadius: 999, backgroundColor: C.plumCard, transform: [{ scale: pressed ? 0.96 : 1 }], elevation: 8, shadowColor: "#261433", shadowOpacity: 0.25, shadowRadius: 14, shadowOffset: { width: 0, height: 8 } })}>
      <AskIcon state="typing" size={40} />
      <Txt style={{ color: "#FFFFFF", fontFamily: F.bold }}>{tx("Ask Jovita")}</Txt>
    </Pressable>
  );
}

export default function Today() {
  const { loading, studio, clients, projects, invoices, bookings, galleries, expenses, subscriptions, client, reload } = useData();
  const { dark, setMode } = useTheme();
  const insets = useSafeAreaInsets();
  const { projectAction, invoiceAction } = useActions();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  if (loading || !studio) return <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: C.paper }}><ActivityIndicator color={C.ink} /></View>;

  const h = new Date().getHours();
  const greet = h < 12 ? tx("Good morning") : h < 17 ? tx("Good afternoon") : tx("Good evening");

  if (!clients.length) {
    return (
      <Screen header={<BlobHeader eyebrow={tx("Welcome")} title={`${greet}, ${studio.owner_first_name}`} sub={tx("Let's set up {name}.", {
        name: studio.name
      })} />}>
        <Card tone="lilac"><Txt variant="h3">{tx("Add your first client")}</Txt><Txt>{tx("Then create a project, share one link, and get paid.")}</Txt><Button title={tx("Add a client")} icon="plus" onPress={() => router.push("/new/client")} /></Card>
        <Card><Txt variant="h3">{tx("Explore with example data")}</Txt><Txt style={{ color: C.muted }}>{tx("We'll add 7 made-up clients with projects, invoices and bookings.")}</Txt>
          <Button variant="secondary" title={busy ? tx("Adding…") : tx("Load example data")} disabled={busy} onPress={async () => {
            setBusy(true);
            try { await loadSampleData(studio.id); await reload(); toast(tx("Example data added")); } catch (e) { toast(e.message); } finally { setBusy(false); }
          }} /></Card>
      </Screen>
    );
  }

  const todos = [];
  invoices.forEach((i) => {
    const st = invState(i);
    if (st.k === "Overdue") todos.push({ tone: "danger", primary: true, icon: "wallet", title: txn(st.late, "{name}'s invoice ({amount}) is {n} day late", "{name}'s invoice ({amount}) is {n} days late", { name: first(client(i.client_id).name), amount: short(i.amount, i.currency) }), sub: `#${i.number} · ${i.label}`, btn: tx("Nudge"), run: () => invoiceAction(i, "nudge") });
    if (st.k === "Check payment") todos.push({ tone: "info", icon: "wallet", title: tx("{name} says they've paid", { name: first(client(i.client_id).name) }), sub: tx("{amount} · check your account", { amount: short(i.amount, i.currency) }), btn: tx("Paid"), run: () => invoiceAction(i, "markpaid") });
  });
  projects.forEach((p) => {
    const c = client(p.client_id);
    if (p.stage === "inquiry") todos.push({ tone: "info", icon: "chat", title: tx("{name} asked about {title}", { name: c.name, title: p.title.toLowerCase() }), sub: fday(p.session_date), btn: tx("Quote"), run: () => projectAction(p, "quote") });
    else if (!p.contract_signed && p.contract_template_id && p.stage !== "delivered") todos.push({ tone: "warning", icon: "file", title: tx("{name}'s contract isn't signed", { name: first(c.name) }), sub: p.title, btn: tx("Share"), run: () => projectAction(p, "contract") });
  });
  galleries.forEach((g) => {
    if (g.status === "delivered" && g.expires_on && daysFrom(g.expires_on) <= 10 && daysFrom(g.expires_on) >= 0) todos.push({ tone: "joy", icon: "image", title: tx("\"{title}\" closes in {n} days", { title: g.title, n: daysFrom(g.expires_on) }), sub: tx("Offer prints before it closes"), btn: tx("Open"), run: () => router.push("/galleries") });
  });

  const home = studio.home_currency;
  const unpaid = invoices.filter((i) => i.status === "sent");
  const owed = totalLine(totalsBy(unpaid), home);
  const overdue = unpaid.filter((i) => invState(i).k === "Overdue").length;
  const month = summary({ invoices, expenses: expenses || [], subscriptions: subscriptions || [] }, "month", home);
  const upcoming = bookings.filter((b) => new Date(b.starts_at) >= new Date(new Date().toDateString())).sort((a, b) => (a.starts_at < b.starts_at ? -1 : 1));
  const week = upcoming.filter((b) => daysFrom(b.starts_at) <= 7);
  const next = upcoming[0];
  const BAR = { danger: C.danger, warning: C.warning, info: C.info, joy: C.marigold };

  return (
    <View style={{ flex: 1 }}>
      <Screen header={
        <View style={{ paddingTop: insets.top + 16, paddingHorizontal: 16, paddingBottom: 16, flexDirection: "row", alignItems: "center", gap: 12 }}>
          <View style={{ flex: 1 }}>
            <PlanBadge />
            <Txt style={{ fontSize: 13, fontFamily: F.semi, color: C.muted }}>{fday(new Date().toISOString())}</Txt>
            <Txt variant="h1" style={{ fontSize: 28, lineHeight: 32 }}>{greet}, {studio.owner_first_name}</Txt>
          </View>
          <Pressable onPress={() => setMode(dark ? "light" : "dark")} accessibilityRole="button" accessibilityLabel={tx("Switch bright or dark mode")}
            style={{ width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: C.lineStrong, backgroundColor: C.surface, alignItems: "center", justifyContent: "center" }}>
            <Icon name={dark ? "moon" : "today"} size={20} />
          </Pressable>
        </View>
      }>
        <Pressable onPress={() => router.push("/money")} accessibilityRole="button" style={{ backgroundColor: C.plumCard, borderRadius: 24, padding: 20, gap: 6 }}>
          <Txt style={{ fontSize: 13, fontFamily: F.semi, color: "#D9CCE6" }}>{tx("Owed to you")}</Txt>
          <Txt style={{ fontFamily: F.display, fontSize: 38, lineHeight: 44, color: C.marigold }} numberOfLines={1} adjustsFontSizeToFit>{owed.main}</Txt>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
            <Txt style={{ fontSize: 13, color: "#D9CCE6", flexShrink: 1 }} numberOfLines={1}>{txn(unpaid.length, "{n} invoice", "{n} invoices")}{overdue ? " · " + txn(overdue, "{n} late", "{n} late") : ""} · {studio.reminders_on ? tx("reminders on") : tx("reminders off")}</Txt>
            <View style={{ backgroundColor: C.marigold, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 2 }}><Txt style={{ fontSize: 12, fontFamily: F.bold, color: "#261433" }}>{tx("See all")}</Txt></View>
          </View>
        </Pressable>
        <View style={{ flexDirection: "row", gap: 10 }}>
          <Stat label={tx("Paid this month")} value={short(month.income, home)} note={txn(month.incomeRows.length, "{n} payment", "{n} payments")} />
          <Stat tone="lilac" label={tx("Shoots this week")} value={String(week.length)} note={week[0] ? tx("Next: {first}", { first: first(client(week[0].client_id).name) }) : tx("Nothing booked")} />
        </View>
        <Txt variant="h2" style={{ fontSize: 20, marginTop: 4 }}>{tx("Needs you today")}</Txt>
        {todos.length ? todos.map((t, ix) => (
          <View key={ix} style={{ flexDirection: "row", alignItems: "center", gap: 10, padding: 12, backgroundColor: C.surface, borderWidth: 1, borderColor: C.line, borderRadius: 16 }}>
            <View style={{ width: 8, height: 40, borderRadius: 4, backgroundColor: BAR[t.tone] || C.info }} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Txt style={{ fontFamily: F.bold }} numberOfLines={2}>{t.title}</Txt>
              <Txt style={{ fontSize: 13, color: C.muted }} numberOfLines={1}>{t.sub}</Txt>
            </View>
            <Button small variant={t.primary ? "primary" : "secondary"} title={t.btn} onPress={t.run} />
          </View>
        )) : <Txt style={{ color: C.muted }}>{tx("You're all caught up. Enjoy the shoot!")}</Txt>}
        <Txt variant="h2" style={{ fontSize: 20, marginTop: 4 }}>{tx("Next shoot")}</Txt>
        {next ? (
          <Pressable onPress={next.project_id ? () => router.push(`/project/${next.project_id}`) : undefined}
            style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: 12, backgroundColor: C.surface, borderWidth: 1, borderColor: C.line, borderRadius: 16 }}>
            <View style={{ width: 48, alignItems: "center" }}>
              <Txt style={{ fontSize: 12, fontFamily: F.bold, color: C.muted, textTransform: "uppercase" }}>{dow(next.starts_at)}</Txt>
              <Txt style={{ fontFamily: F.displayBold, fontSize: 22, lineHeight: 26 }}>{dom(next.starts_at)}</Txt>
            </View>
            <View style={{ flex: 1 }}>
              <Txt style={{ fontFamily: F.bold }}>{first(client(next.client_id).name)} · {next.title}</Txt>
              <Txt style={{ fontSize: 13, color: C.muted }}>{ftime(next.starts_at)}{client(next.client_id).city ? " · " + client(next.client_id).city : ""}</Txt>
            </View>
          </Pressable>
        ) : <Txt style={{ color: C.muted }}>{tx("No sessions booked yet.")}</Txt>}
      </Screen>
      <AskButton />
    </View>
  );
}
