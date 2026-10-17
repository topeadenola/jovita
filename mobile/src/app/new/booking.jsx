import { useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { useData } from "../../lib/data";
import { addDays } from "../../lib/format";
import { Button, Chips, Field, Screen, Txt, useToast } from "../../components/ui";
import { C, F } from "../../lib/theme";
import { tx } from "../../lib/i18n";

const Label = ({ children }) => <Txt style={{ fontFamily: F.semi, fontSize: 13 }}>{children}</Txt>;

export default function NewBooking() {
  const { loading } = useData();
  if (loading) return <Screen><Txt>{tx("Loading…")}</Txt></Screen>;
  return <NewBookingForm />;
}

function NewBookingForm() {
  const { clients, projects, session_types, insert, bookings, calendar_busy } = useData();
  const toast = useToast();
  const [f, setF] = useState({ client_id: clients[0]?.id || "", project_id: "", title: session_types[0]?.name || "Session", date: addDays(7), time: "10:00", location: "" });
  const [err, setErr] = useState("");
  const set = (k) => (v) => setF({ ...f, [k]: v });
  if (!clients.length) return <Screen><Txt>{tx("Add a client first.")}</Txt></Screen>;
  const cp = projects.filter((p) => p.client_id === f.client_id);
  const st = new Date(`${f.date}T${(f.time || "10:00").padStart(5, "0")}:00`), en = new Date(st.getTime() + 36e5);
  const clash = isNaN(st) ? null : [...calendar_busy.map((b) => ({ t: b.title, s: b.starts_at, e: b.ends_at, g: true })), ...bookings.map((b) => ({ t: b.title, s: b.starts_at, e: b.ends_at || new Date(new Date(b.starts_at).getTime() + 36e5) }))]
    .find((x) => new Date(x.s) < en && new Date(x.e) > st);
  return (
    <Screen refresh={false}>
      <Label>{tx("Client")}</Label>
      <Chips options={clients.map((c) => [c.id, c.name])} value={f.client_id} onChange={(v) => setF({ ...f, client_id: v, project_id: "" })} />
      {cp.length > 0 && (<><Label>{tx("Project")}</Label><Chips options={[["", "None"], ...cp.map((p) => [p.id, p.title])]} value={f.project_id} onChange={set("project_id")} /></>)}
      {session_types.length > 0 && (<><Label>{tx("Session type")}</Label><Chips options={session_types.map((s) => [s.name, s.name])} value={f.title} onChange={set("title")} /></>)}
      <Field label={tx("Session name")} value={f.title} onChangeText={set("title")} />
      <View style={{ flexDirection: "row", gap: 12 }}>
        <Field style={{ flex: 1 }} label={tx("Date")} value={f.date} onChangeText={set("date")} placeholder={tx("YYYY-MM-DD")} />
        <Field style={{ width: 110 }} label={tx("Time")} value={f.time} onChangeText={set("time")} placeholder="10:00" />
      </View>
      <Field label={tx("Where")} value={f.location} onChangeText={set("location")} placeholder={tx("Studio, address or video call")} />
      {clash && <Txt style={{ color: C.warning, backgroundColor: C.warningTint, padding: 10, borderRadius: 12, fontFamily: F.semi }}>{tx("You're already busy then:")}{" "}{clash.t}{clash.g ? tx(" (Google Calendar)") : ""}{tx(". You can still book it.")}</Txt>}
      {!!err && <Txt style={{ color: C.danger }}>{err}</Txt>}
      <Button title={tx("Book it")} onPress={async () => {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(f.date) || !/^\d{1,2}:\d{2}$/.test(f.time)) return setErr(tx("Use YYYY-MM-DD for the date and HH:MM for the time."));
        try {
          await insert("bookings", { client_id: f.client_id, project_id: f.project_id || null, title: f.title || "Session", starts_at: new Date(`${f.date}T${f.time.padStart(5, "0")}:00`).toISOString(), location: f.location });
          toast(tx("Session booked")); router.back();
        } catch (e) { setErr(e.message); }
      }} />
    </Screen>
  );
}
