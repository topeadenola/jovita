import { useState } from "react";
import { Linking, View } from "react-native";
import { router } from "expo-router";
import { supabase } from "../lib/supabase";
import { useData } from "../lib/data";
import { daysFrom, dom, dow, fday, ftime, money } from "../lib/format";
import Icon from "../components/Icon";
import { Button, Card, Dot, Pill, Row, Screen, Txt, useToast } from "../components/ui";
import { C, F } from "../lib/theme";
import { tx } from "../lib/i18n";

function GoogleCard() {
  const { calendar_connections, reload } = useData();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const conn = calendar_connections[0];
  const call = async (action) => {
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("google-calendar", { body: { action, from: "web" } });
      if (error) { let m = error.message; try { m = (await error.context.json()).error || m; } catch { /* keep */ } throw new Error(m); }
      return data;
    } finally { setBusy(false); }
  };
  const run = (fn) => async () => { try { await fn(); } catch (e) { toast(e.message); } };
  return (
    <Card tone={conn ? undefined : "lilac"}>
      <View style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
        <Dot icon="calendar" tone={conn ? "success" : "info"} />
        <View style={{ flex: 1 }}>
          <Txt style={{ fontFamily: F.bold }}>{conn ? tx("Google Calendar connected") : tx("Sync with Google Calendar")}</Txt>
          <Txt style={{ fontSize: 13, color: C.muted }}>{conn ? tx("{v0} · both ways", {
            v0: conn.google_email || tx("Your Google account")
          }) : tx("Bookings show in Google, and Google events block time here.")}</Txt>
        </View>
      </View>
      {!!conn?.last_error && <Txt style={{ color: C.danger, fontSize: 13 }}>{conn.last_error}</Txt>}
      {conn ? (
        <View style={{ flexDirection: "row", gap: 8 }}>
          <Button small variant="secondary" title={busy ? tx("Syncing…") : tx("Sync now")} disabled={busy} onPress={run(async () => { const d = await call("sync"); await reload(); toast(tx("Synced{v0}", {
            v0: d.pushed ? tx(" · {pushed} sent to Google", {
              pushed: d.pushed
            }) : ""
          })); })} />
          <Button small variant="ghost" title={tx("Disconnect")} disabled={busy} onPress={run(async () => { await call("disconnect"); await reload(); toast(tx("Disconnected")); })} />
        </View>
      ) : (
        <Button title={busy ? tx("Opening Google…") : tx("Connect Google Calendar")} disabled={busy}
          onPress={run(async () => { const d = await call("auth_url"); await Linking.openURL(d.url); toast(tx("Finish in the browser, then pull down here to refresh")); })} />
      )}
    </Card>
  );
}

export default function Bookings() {
  const { bookings, calendar_busy, session_types, client, remove } = useData();
  const toast = useToast();
  const today = new Date(new Date().toDateString());
  const up = [...bookings, ...calendar_busy.map((b) => ({ ...b, google: true }))]
    .filter((b) => new Date(b.ends_at || b.starts_at) >= today).sort((a, b) => (a.starts_at < b.starts_at ? -1 : 1)).slice(0, 40);
  return (
    <Screen>
      <Button title={tx("New booking")} icon="calendar" onPress={() => router.push("/new/booking")} />
      <GoogleCard />
      <Card>
        <Txt variant="h2">{tx("Upcoming")}</Txt>
        {up.map((b, ix) => {
          const n = Math.max(0, daysFrom(b.starts_at));
          const date = <View style={{ width: 48, alignItems: "center" }}><Txt style={{ fontSize: 11, fontFamily: F.bold, color: b.google ? C.muted : C.marigoldText }}>{dow(b.starts_at).toUpperCase()}</Txt><Txt style={{ fontFamily: F.displayBold, fontSize: 22, color: b.google ? C.muted : C.ink }}>{dom(b.starts_at)}</Txt></View>;
          if (b.google) return (
            <Row key={b.id} last={ix === up.length - 1} left={date} title={b.title}
              sub={`${fday(b.starts_at)}${b.all_day ? ` · ${tx("All day")}` : ` · ${ftime(b.starts_at)}–${ftime(b.ends_at)}`}`} right={<Pill c="p-info">{tx("Google")}</Pill>} />
          );
          return (
            <Row key={b.id} last={ix === up.length - 1} left={date}
              title={`${b.title} · ${client(b.client_id).name}`} sub={`${fday(b.starts_at)} · ${ftime(b.starts_at)}${b.location ? ` · ${b.location}` : ""}`}
              onPress={b.project_id ? () => router.push(`/project/${b.project_id}`) : undefined}
              right={<View style={{ alignItems: "flex-end", gap: 6 }}>
                <View style={{ flexDirection: "row", gap: 6, alignItems: "center" }}>
                  {!!b.google_event_id && <View accessibilityLabel={tx("Also in Google Calendar")} style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: C.successTint, alignItems: "center", justifyContent: "center" }}><Icon name="check" size={12} color={C.success} stroke={3} /></View>}
                  <Pill c={n <= 1 ? "p-joy" : "p-neutral"}>{n === 0 ? tx("Today") : n === 1 ? tx("Tomorrow") : tx("In {n} days", {
                    n: n
                  })}</Pill>
                </View>
                <Button small variant="ghost" title={tx("Cancel")} onPress={async () => { await remove("bookings", b.id); toast(tx("Booking cancelled")); }} /></View>} />
          );
        })}
        {!up.length && <Txt style={{ color: C.muted }}>{tx("Nothing booked yet.")}</Txt>}
      </Card>
      <Card>
        <Txt variant="h2">{tx("Session types")}</Txt>
        {session_types.map((s, ix) => (
          <Row key={s.id} last={ix === session_types.length - 1} left={<Dot icon="clock" tone="info" />} title={s.name} sub={`${s.length_label} · ${s.availability}`} right={<Txt style={{ fontFamily: F.bold }}>{money(s.price, s.currency)}</Txt>} />
        ))}
        {!session_types.length && <Txt style={{ color: C.muted }}>{tx("Add session types in the web app for now.")}</Txt>}
      </Card>
    </Screen>
  );
}
