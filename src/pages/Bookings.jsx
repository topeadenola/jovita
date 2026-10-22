import { useEffect, useState } from "react";
import { supabase } from "../supabase";
import { useData } from "../lib/data";
import { useUi } from "../components/Shell";
import Icon from "../components/Icon";
import { CloseBtn, Modal, Pill, useToast } from "../components/ui";
import { addDays, daysFrom, dom, dow, fday, ftime, money } from "../lib/format";
import { tx } from "../lib/i18n";

export function BookingForm({ onClose, initial }) {
  const { clients, projects, session_types, insert } = useData();
  const toast = useToast();
  const [f, setF] = useState({ client_id: clients[0]?.id || "", project_id: "", title: session_types[0]?.name || "Session", date: addDays(7), time: "10:00", location: "", ...(initial || {}) });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const [err, setErr] = useState("");
  const { bookings, calendar_busy } = useData();
  const start = new Date(`${f.date}T${f.time || "10:00"}:00`), end = new Date(start.getTime() + 36e5);
  const clash = [...calendar_busy.map((b) => ({ t: b.title, s: b.starts_at, e: b.ends_at, g: true })), ...bookings.map((b) => ({ t: b.title, s: b.starts_at, e: b.ends_at || new Date(new Date(b.starts_at).getTime() + 36e5) }))]
    .find((x) => new Date(x.s) < end && new Date(x.e) > start);
  return (
    <Modal label={tx("New booking")} onClose={onClose}>
      <form style={{ display: "flex", flexDirection: "column", gap: 16 }} onSubmit={async (e) => {
        e.preventDefault();
        if (!f.client_id) return setErr(tx("Add a client first."));
        try {
          const starts_at = new Date(`${f.date}T${f.time || "10:00"}:00`).toISOString();
          await insert("bookings", { client_id: f.client_id, project_id: f.project_id || null, title: f.title || "Session", starts_at, location: f.location });
          toast(tx("Session booked")); onClose();
        } catch (x) { setErr(x.message); }
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><h2 className="h-l">{tx("New booking")}</h2><CloseBtn onClick={onClose} /></div>
        <div className="form-grid">
          <div className="field"><label htmlFor="b-client">{tx("Client")}</label><select id="b-client" value={f.client_id} onChange={(e) => setF({ ...f, client_id: e.target.value, project_id: "" })}>{clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
          <div className="field"><label htmlFor="b-project">{tx("Project")}</label><select id="b-project" value={f.project_id} onChange={set("project_id")}><option value="">{tx("None")}</option>{projects.filter((p) => p.client_id === f.client_id).map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}</select></div>
        </div>
        <div className="field"><label htmlFor="b-title">{tx("Session")}</label><input id="b-title" list="b-types" value={f.title} onChange={set("title")} /><datalist id="b-types">{session_types.map((s) => <option key={s.id} value={s.name} />)}</datalist></div>
        <div className="form-grid">
          <div className="field"><label htmlFor="b-date">{tx("Date")}</label><input id="b-date" type="date" value={f.date} onChange={set("date")} /></div>
          <div className="field"><label htmlFor="b-time">{tx("Time")}</label><input id="b-time" type="time" value={f.time} onChange={set("time")} /></div>
        </div>
        <div className="field"><label htmlFor="b-loc">{tx("Where")}</label><input id="b-loc" value={f.location} onChange={set("location")} placeholder={tx("Studio, address or video call")} /></div>
        {clash && <p className="clash" role="status"><Icon name="clock" />{tx("You're already busy then:")}{" "}{clash.t}{clash.g ? tx(" (Google Calendar)") : ""}{tx(". You can still book it.")}</p>}
        {err && <p className="err">{err}</p>}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}><button type="button" className="btn btn-ghost" data-dismiss onClick={onClose}>{tx("Cancel")}</button><button className="btn btn-primary">{tx("Book it")}</button></div>
      </form>
    </Modal>
  );
}

export function GoogleCard() {
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
  const connect = async () => { try { const d = await call("auth_url"); window.location.href = d.url; } catch (e) { toast(e.message); } };
  const sync = async () => { try { const d = await call("sync"); await reload(); toast(tx("Synced with Google{v0}", {
    v0: d.pushed ? tx(" · {pushed} sent", {
      pushed: d.pushed
    }) : ""
  })); } catch (e) { toast(e.message); } };
  const disconnect = async () => { try { await call("disconnect"); await reload(); toast(tx("Google Calendar disconnected")); } catch (e) { toast(e.message); } };
  return (
    <section className="card gcal">
      <span className="gmark" aria-hidden="true"><Icon name="calendar" /></span>
      <div style={{ flex: 1, minWidth: 220 }}>
        <b>{conn ? tx("Google Calendar is connected") : tx("Sync with Google Calendar")}</b>
        <p className="sub" style={{ fontSize: 13 }}>{conn
          ? tx("{v0} · bookings go both ways{v1}", {
          v0: conn.google_email || tx("Your Google account"),

          v1: conn.last_synced_at ? tx(" · synced {v0}", {
            v0: new Date(conn.last_synced_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
          }) : ""
        })
          : tx(
          "Book here and it shows in Google. Busy in Google and Jovita knows, so you never double-book."
        )}</p>
        {conn?.last_error && <p className="err" style={{ fontSize: 13 }}>{conn.last_error}</p>}
      </div>
      {conn ? (<div style={{ display: "flex", gap: 8 }}>
        <button className="btn btn-secondary btn-sm" disabled={busy} onClick={sync}>{busy ? tx("Syncing…") : tx("Sync now")}</button>
        <button className="btn btn-ghost btn-sm" disabled={busy} onClick={disconnect}>{tx("Disconnect")}</button></div>)
        : <button className="btn btn-primary" disabled={busy} onClick={connect}>{busy ? tx("Opening Google…") : tx("Connect Google Calendar")}</button>}
    </section>
  );
}

export default function Bookings() {
  const { bookings, calendar_busy, session_types, client, remove } = useData();
  const { open } = useUi();
  const toast = useToast();
  const [form, setForm] = useState(false);
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    if (q.get("google") === "connected") toast(tx("Google Calendar connected"), true);
    if (q.get("google") === "failed") toast(tx("Couldn't connect Google: {v0}", {
      v0: q.get("reason") || tx("try again")
    }));
    if (q.get("google")) window.history.replaceState(null, "", window.location.pathname);
  }, [toast]);
  const today = new Date(new Date().toDateString());
  const up = [...bookings, ...calendar_busy.map((b) => ({ ...b, google: true }))]
    .filter((b) => new Date(b.ends_at || b.starts_at) >= today).sort((a, b) => (a.starts_at < b.starts_at ? -1 : 1)).slice(0, 40);

  return (
    <>
      <div className="head"><div><p className="eyebrow">{tx("Bookings")}</p><h1 className="h-l">{tx("Sessions and availability")}</h1></div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button className="btn btn-secondary" onClick={() => open("session")}><Icon name="plus" />{tx("Session type")}</button>
          <button className="btn btn-primary" onClick={() => setForm(true)}><Icon name="calendar" />{tx("New booking")}</button>
        </div></div>
      <GoogleCard />
      <div className="split">
        <section className="card"><h2 className="h-m" style={{ marginBottom: 8 }}>{tx("Upcoming")}</h2>
          <div className="todo">
            {up.map((b) => { const n = Math.max(0, daysFrom(b.starts_at)); return b.google ? (
              <div className="todo-item busy" key={b.id}>
                <div style={{ width: 54, textAlign: "center", flex: "none" }}><p style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)" }}>{dow(b.starts_at).toUpperCase()}</p><p style={{ fontFamily: "var(--font-display)", fontSize: 24, fontWeight: 700, color: "var(--muted)" }}>{dom(b.starts_at)}</p></div>
                <div className="todo-text"><b>{b.title}</b><span>{fday(b.starts_at)}{b.all_day ? tx(" · All day") : ` · ${ftime(b.starts_at)}–${ftime(b.ends_at)}`}</span></div>
                <Pill c="p-info">{tx("From Google")}</Pill>
              </div>
            ) : (
              <div className="todo-item" key={b.id}>
                <div style={{ width: 54, textAlign: "center", flex: "none" }}><p style={{ fontSize: 12, fontWeight: 700, color: "var(--marigold-text)" }}>{dow(b.starts_at).toUpperCase()}</p><p style={{ fontFamily: "var(--font-display)", fontSize: 24, fontWeight: 700 }}>{dom(b.starts_at)}</p></div>
                <div className="todo-text"><b>{b.title} · {client(b.client_id).name}</b><span>{fday(b.starts_at)} · {ftime(b.starts_at)}{b.location ? ` · ${b.location}` : ""}</span></div>
                <Pill c={n <= 1 ? "p-joy" : "p-neutral"}>{n === 0 ? tx("Today") : n === 1 ? tx("Tomorrow") : tx("In {n} days", {
                  n: n
                })}</Pill>
                {b.google_event_id && <span className="gsync" title={tx("Also in Google Calendar")}><Icon name="check" /></span>}
                <button className="btn btn-ghost btn-sm" aria-label={tx("Cancel booking")} onClick={async () => { if (!window.confirm(tx("Cancel {title} on {day}? This removes the booking.", { title: b.title, day: fday(b.starts_at) }))) return; await remove("bookings", b.id); toast(tx("Booking cancelled")); }}><Icon name="x" /></button>
              </div>
            ); })}
            {!up.length && <p className="sub">{tx("Nothing booked yet.")}</p>}
          </div>
        </section>
        <section className="card"><h2 className="h-m" style={{ marginBottom: 8 }}>{tx("Session types")}</h2>
          <div className="todo">
            {session_types.map((s) => (
              <div className="todo-item" key={s.id}><span className="dot d-info"><Icon name="clock" /></span><div className="todo-text"><b>{s.name}</b><span>{s.length_label} · {s.availability}</span></div><b className="num">{money(s.price, s.currency)}</b></div>
            ))}
            {!session_types.length && <p className="sub">{tx("Add the sessions you offer so clients can book them.")}</p>}
          </div>
          <p className="sub" style={{ fontSize: 13, marginTop: 10 }}>{tx("A public booking page comes next.")}</p>
        </section>
      </div>
      {form && <BookingForm onClose={() => setForm(false)} />}
    </>
  );
}
