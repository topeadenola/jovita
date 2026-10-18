// Calendar: everything with a date in one place — sessions, shoots, payments due and Google Calendar.
// Month, week, day and list views. Click an empty slot to book; click anything to see it.
import { useEffect, useMemo, useRef, useState } from "react";
import { useData } from "../lib/data";
import { useUi } from "../components/Shell";
import Icon from "../components/Icon";
import { useToast } from "../components/ui";
import { BookingForm, GoogleCard } from "./Bookings";
import { balanceOf, isoDay, money } from "../lib/format";
import { locale, tx, txn } from "../lib/i18n";

const H0 = 7, H1 = 22, ROW = 52; // day grid: 7am to 10pm, 52px an hour
const DAY = 864e5;
const fmt = (o) => { try { return new Intl.DateTimeFormat(locale(), o); } catch { return new Intl.DateTimeFormat("en-GB", o); } };
const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const addD = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const startOfWeek = (d) => { const x = startOfDay(d); const k = (x.getDay() + 6) % 7; return addD(x, -k); }; // Monday first
const sameDay = (a, b) => isoDay(a) === isoDay(b);
const timeOf = (d) => fmt({ hour: "numeric", minute: "2-digit" }).format(d);
const KINDS = [["session", "Sessions"], ["shoot", "Shoots"], ["due", "Payments due"], ["google", "Google Calendar"]];
const VIEWS = [["year", "Year"], ["month", "Month"], ["week", "Week"], ["day", "Day"], ["list", "List"]];
const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private window */ } };

export default function Calendar() {
  const { bookings, calendar_busy, projects, invoices, client, remove, calendar_connections } = useData();
  const { setOpenProject, setOpenInvoice } = useUi();
  const toast = useToast();
  const [view, setView] = useState(() => load("jv-cal-view", window.innerWidth < 700 ? "list" : "month"));
  const [cursor, setCursor] = useState(() => startOfDay(new Date()));
  const [show, setShow] = useState(() => load("jv-cal-show", { session: true, shoot: true, due: true, google: true }));
  const [pick, setPick] = useState(null); // the event whose card is open
  const [book, setBook] = useState(null); // {date, time} for a new booking
  const [now, setNow] = useState(new Date());
  useEffect(() => save("jv-cal-view", view), [view]);
  useEffect(() => save("jv-cal-show", show), [show]);
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 60000); return () => clearInterval(t); }, []);

  // Everything with a date, as one list of events
  const events = useMemo(() => {
    const out = [];
    const booked = new Set();
    bookings.forEach((b) => {
      const s = new Date(b.starts_at), e = b.ends_at ? new Date(b.ends_at) : new Date(s.getTime() + 36e5);
      if (b.project_id) booked.add(b.project_id + isoDay(s));
      out.push({ id: "b" + b.id, kind: "session", title: b.title || tx("Session"), who: client(b.client_id).name, start: s, end: e, where: b.location, raw: b, synced: !!b.google_event_id });
    });
    projects.forEach((p) => {
      if (!p.session_date || booked.has(p.id + p.session_date)) return;
      const s = new Date(p.session_date + "T00:00:00");
      out.push({ id: "p" + p.id, kind: "shoot", title: p.title, who: client(p.client_id).name, start: s, end: addD(s, 1), allDay: true, raw: p });
    });
    invoices.forEach((i) => {
      if (i.kind === "quote" || i.status !== "sent" || !i.due_date) return;
      const s = new Date(i.due_date + "T00:00:00");
      out.push({ id: "i" + i.id, kind: "due", title: `${money(balanceOf(i), i.currency)} ${tx("due")}`, who: client(i.client_id).name, start: s, end: addD(s, 1), allDay: true, late: s < startOfDay(new Date()), raw: i });
    });
    calendar_busy.forEach((g) => {
      const s = new Date(g.starts_at), e = new Date(g.ends_at || g.starts_at);
      out.push({ id: "g" + g.id, kind: "google", title: g.title || tx("Busy"), start: s, end: e, allDay: !!g.all_day, raw: g });
    });
    return out.filter((e) => show[e.kind]).sort((a, b) => a.start - b.start);
  }, [bookings, calendar_busy, projects, invoices, client, show]);

  const onDay = (d) => events.filter((e) => e.start < addD(startOfDay(d), 1) && e.end > startOfDay(d) && !(e.allDay && e.end <= startOfDay(d)));
  const step = (n) => setCursor((c) => view === "year" ? new Date(c.getFullYear() + n, c.getMonth(), 1) : view === "month" ? new Date(c.getFullYear(), c.getMonth() + n, 1) : addD(c, (view === "week" ? 7 : view === "day" ? 1 : 30) * n));
  const today = () => setCursor(startOfDay(new Date()));
  const openDay = (d) => { setCursor(startOfDay(d)); setView("day"); };
  const newAt = (d, hour) => setBook({ date: isoDay(d), time: hour != null ? `${String(hour).padStart(2, "0")}:00` : "10:00" });

  // Keyboard: ← → to move, T for today, M W D L to switch views
  useEffect(() => {
    const k = (e) => {
      if (e.target.closest("input,textarea,select,[contenteditable]") || pick || book || e.metaKey || e.ctrlKey) return;
      if (e.key === "ArrowLeft") step(-1); else if (e.key === "ArrowRight") step(1);
      else if (e.key === "t") today();
      else { const v = { y: "year", m: "month", w: "week", d: "day", l: "list" }[e.key]; if (v) setView(v); }
    };
    window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k);
  });

  const title = view === "year" ? String(cursor.getFullYear()) : view === "month" || view === "list" ? fmt({ month: "long", year: "numeric" }).format(cursor)
    : view === "week" ? (() => { const a = startOfWeek(cursor), b = addD(a, 6); return a.getMonth() === b.getMonth() ? `${a.getDate()}–${b.getDate()} ${fmt({ month: "long", year: "numeric" }).format(b)}` : `${fmt({ day: "numeric", month: "short" }).format(a)} – ${fmt({ day: "numeric", month: "short", year: "numeric" }).format(b)}`; })()
    : fmt({ weekday: "long", day: "numeric", month: "long" }).format(cursor);

  const upcoming = events.filter((e) => e.end >= now).slice(0, 6);
  const counts = useMemo(() => { const a = startOfWeek(new Date()), b = addD(a, 7); const w = events.filter((e) => e.start >= a && e.start < b); return { sessions: w.filter((e) => e.kind === "session" || e.kind === "shoot").length, due: w.filter((e) => e.kind === "due").length }; }, [events]);
  const connected = (calendar_connections || []).length > 0;

  return (
    <div className="cal">
      <div className="cal-top">
        <div className="cal-title">
          <p className="eyebrow">{tx("Calendar")}</p>
          <h1 className="h-l">{title}</h1>
          <p className="sub">{counts.sessions ? txn(counts.sessions, "{n} session this week", "{n} sessions this week") : tx("Nothing booked this week yet")}{counts.due ? " · " + txn(counts.due, "{n} payment due", "{n} payments due") : ""}</p>
        </div>
        <div className="cal-tools">
          <div className="cal-nav">
            <button type="button" className="cal-arrow" onClick={() => step(-1)} aria-label={tx("Previous")}><Icon name="arrow" /></button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={today}>{tx("Today")}</button>
            <button type="button" className="cal-arrow next" onClick={() => step(1)} aria-label={tx("Next")}><Icon name="arrow" /></button>
          </div>
          <div className="seg cal-views" role="tablist" aria-label={tx("View")}>
            {VIEWS.map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={view === k} aria-pressed={view === k} onClick={() => setView(k)}>{tx(l)}</button>)}
          </div>
          <button type="button" className="btn btn-primary" onClick={() => newAt(cursor < startOfDay(new Date()) ? new Date() : cursor)}><Icon name="plus" />{tx("New booking")}</button>
        </div>
      </div>

      <div className="cal-filters">
        {KINDS.map(([k, l]) => <button key={k} type="button" className={`cal-chip k-${k}`} aria-pressed={!!show[k]} onClick={() => setShow({ ...show, [k]: !show[k] })}><i />{tx(l)}</button>)}
        {!connected && <span className="sub cal-hint"><Icon name="calendar" />{tx("Connect Google Calendar below to see your other plans here too.")}</span>}
      </div>

      <div className={`cal-body v-${view}`}>
        <div className="cal-main card">
          {view === "year" && <Year cursor={cursor} now={now} events={events} openDay={openDay} openMonth={(d) => { setCursor(d); setView("month"); }} />}
          {view === "month" && <Month cursor={cursor} now={now} onDay={onDay} onPick={setPick} openDay={openDay} newAt={newAt} />}
          {(view === "week" || view === "day") && <TimeGrid days={view === "week" ? Array.from({ length: 7 }, (_, i) => addD(startOfWeek(cursor), i)) : [cursor]} now={now} onDay={onDay} onPick={setPick} newAt={newAt} openDay={openDay} />}
          {view === "list" && <List from={new Date(cursor.getFullYear(), cursor.getMonth(), 1)} events={events} onPick={setPick} />}
        </div>
        <aside className="cal-side">
          <MiniMonth cursor={cursor} now={now} events={events} onPickDay={(d) => { setCursor(startOfDay(d)); if (view === "month") setView("day"); }} />
          <div className="card cal-next">
            <h2 className="h-s">{tx("Coming up")}</h2>
            {upcoming.length ? upcoming.map((e) => (
              <button type="button" key={e.id} className={`cal-up k-${e.kind}`} onClick={() => setPick(e)}>
                <span className="cal-up-date"><b>{e.start.getDate()}</b><small>{fmt({ month: "short" }).format(e.start)}</small></span>
                <span className="cal-up-text"><b>{e.title}</b><small>{e.allDay ? tx("All day") : timeOf(e.start)}{e.who ? " · " + e.who : ""}</small></span>
              </button>
            )) : <p className="sub" style={{ fontSize: 13 }}>{tx("Nothing coming up. Enjoy the quiet.")}</p>}
          </div>
        </aside>
      </div>

      <div className="cal-google"><GoogleCard /></div>
      <p className="sub cal-keys">{tx("Tip: use ← → to move, T for today, and Y, M, W, D, L to switch views.")}</p>

      {pick && <EventCard e={pick} onClose={() => setPick(null)}
        openProject={(id) => { setPick(null); setOpenProject(id); }} openInvoice={(id) => { setPick(null); setOpenInvoice(id); }}
        cancel={async (b) => { if (!window.confirm(tx("Cancel this booking?"))) return; await remove("bookings", b.id); setPick(null); toast(tx("Booking cancelled")); }} />}
      {book && <BookingForm initial={book} onClose={() => setBook(null)} />}
    </div>
  );
}

function Pillish({ e, onPick, compact }) {
  return (
    <button type="button" className={`cal-ev k-${e.kind}${e.late ? " late" : ""}${compact ? " compact" : ""}`} onClick={(x) => { x.stopPropagation(); onPick(e); }} title={`${e.title}${e.who ? " · " + e.who : ""}`}>
      {!e.allDay && <span className="t">{timeOf(e.start)}</span>}<span className="n">{e.kind === "due" ? `${e.who}: ${e.title}` : e.title}</span>
    </button>
  );
}

function Month({ cursor, now, onDay, onPick, openDay, newAt }) {
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const start = startOfWeek(first);
  const weeks = Math.ceil(((first - start) / DAY + new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate()) / 7);
  const days = Array.from({ length: weeks * 7 }, (_, i) => addD(start, i));
  const names = Array.from({ length: 7 }, (_, i) => fmt({ weekday: "short" }).format(addD(start, i)));
  return (
    <div className="cal-month" style={{ gridTemplateRows: `auto repeat(${weeks}, minmax(0, 1fr))` }}>
      {names.map((n) => <div key={n} className="cal-dow">{n}</div>)}
      {days.map((d) => {
        const list = onDay(d), out = d.getMonth() !== cursor.getMonth(), isToday = sameDay(d, now), past = d < startOfDay(now);
        return (
          <div key={+d} className={`cal-cell${out ? " out" : ""}${isToday ? " today" : ""}${past ? " past" : ""}`} onClick={() => openDay(d)} onDoubleClick={(x) => { x.stopPropagation(); newAt(d); }}>
            <div className="cal-cell-top"><span className="cal-num">{d.getDate()}</span>{list.length > 0 && <span className="cal-dots">{[...new Set(list.map((e) => e.kind))].map((k) => <i key={k} className={`k-${k}`} />)}</span>}</div>
            <div className="cal-cell-evs">
              {list.slice(0, 3).map((e) => <Pillish key={e.id} e={e} onPick={onPick} compact />)}
              {list.length > 3 && <button type="button" className="cal-more" onClick={(x) => { x.stopPropagation(); openDay(d); }}>{tx("+{n} more", { n: list.length - 3 })}</button>}
            </div>
            <button type="button" className="cal-add" onClick={(x) => { x.stopPropagation(); newAt(d); }} aria-label={tx("Book on {date}", { date: fmt({ day: "numeric", month: "long" }).format(d) })}><Icon name="plus" /></button>
          </div>
        );
      })}
    </div>
  );
}

// Lay out overlapping timed events side by side
function columns(list) {
  const placed = [];
  list.forEach((e) => {
    const clash = placed.filter((p) => p.e.start < e.end && p.e.end > e.start);
    let col = 0; while (clash.some((p) => p.col === col)) col++;
    placed.push({ e, col });
  });
  return placed.map((p) => ({ ...p, cols: Math.max(...placed.filter((q) => q.e.start < p.e.end && q.e.end > p.e.start).map((q) => q.col)) + 1 }));
}

function TimeGrid({ days, now, onDay, onPick, newAt, openDay }) {
  const box = useRef(null);
  useEffect(() => { const h = Math.max(H0, Math.min(now.getHours() - 1, H1 - 6)); if (box.current) box.current.scrollTop = (h - H0) * ROW; }, [days.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const hours = Array.from({ length: H1 - H0 }, (_, i) => H0 + i);
  const one = days.length === 1;
  return (
    <div className={`cal-grid${one ? " one" : ""}`} style={{ "--cols": days.length }}>
      <div className="cal-grid-head">
        <div className="cal-gutter" />
        {days.map((d) => (
          <button type="button" key={+d} className={`cal-head-day${sameDay(d, now) ? " today" : ""}`} onClick={() => !one && openDay(d)}>
            <small>{fmt({ weekday: one ? "long" : "short" }).format(d)}</small><b>{d.getDate()}</b>
          </button>
        ))}
      </div>
      <div className="cal-allday">
        <div className="cal-gutter"><small>{tx("All day")}</small></div>
        {days.map((d) => <div key={+d} className="cal-allday-cell">{onDay(d).filter((e) => e.allDay).map((e) => <Pillish key={e.id} e={e} onPick={onPick} compact />)}</div>)}
      </div>
      <div className="cal-scroll" ref={box}>
        <div className="cal-hours" style={{ height: (H1 - H0) * ROW }}>
          <div className="cal-gutter">{hours.map((h) => <span key={h} style={{ top: (h - H0) * ROW }}>{fmt({ hour: "numeric" }).format(new Date(2000, 0, 1, h))}</span>)}</div>
          {days.map((d) => {
            const timed = onDay(d).filter((e) => !e.allDay);
            const isToday = sameDay(d, now);
            return (
              <div key={+d} className={`cal-col${isToday ? " today" : ""}`}>
                {hours.map((h) => <button type="button" key={h} className="cal-slot" style={{ top: (h - H0) * ROW, height: ROW }} onClick={() => newAt(d, h)} aria-label={tx("Book at {time}", { time: fmt({ hour: "numeric" }).format(new Date(2000, 0, 1, h)) })} />)}
                {columns(timed).map(({ e, col, cols }) => {
                  const s = Math.max(H0 * 60, e.start.getHours() * 60 + e.start.getMinutes() - (sameDay(e.start, d) ? 0 : 24 * 60));
                  const en = Math.min(H1 * 60, sameDay(e.end, d) ? e.end.getHours() * 60 + e.end.getMinutes() : 24 * 60);
                  const top = ((Math.max(s, H0 * 60) - H0 * 60) / 60) * ROW, height = Math.max(24, ((en - Math.max(s, H0 * 60)) / 60) * ROW - 3);
                  return (
                    <button type="button" key={e.id} className={`cal-block k-${e.kind}`} style={{ top, height, left: `calc(${(col / cols) * 100}% + 3px)`, width: `calc(${100 / cols}% - 6px)` }} onClick={() => onPick(e)}>
                      <b>{e.title}</b>
                      {height > 34 && <small>{timeOf(e.start)}–{timeOf(e.end)}{e.who ? " · " + e.who : ""}</small>}
                      {height > 60 && e.where && <small className="w"><Icon name="today" />{e.where}</small>}
                    </button>
                  );
                })}
                {isToday && now.getHours() >= H0 && now.getHours() < H1 && <div className="cal-now" style={{ top: ((now.getHours() * 60 + now.getMinutes() - H0 * 60) / 60) * ROW }}><i /></div>}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function List({ from, events, onPick }) {
  const list = events.filter((e) => e.end >= from).slice(0, 120);
  const groups = [];
  list.forEach((e) => { const k = isoDay(e.start); const g = groups[groups.length - 1]; if (g && g.k === k) g.items.push(e); else groups.push({ k, d: e.start, items: [e] }); });
  if (!groups.length) return <div className="cal-empty"><Icon name="calendar" /><b>{tx("Nothing here yet")}</b><span className="sub">{tx("Bookings, shoots and payment dates will show up as you add them.")}</span></div>;
  return (
    <div className="cal-list">
      {groups.map((g) => (
        <div key={g.k} className="cal-list-day">
          <div className={`cal-list-date${sameDay(g.d, new Date()) ? " today" : ""}`}><b>{g.d.getDate()}</b><small>{fmt({ weekday: "short", month: "short" }).format(g.d)}</small></div>
          <div className="cal-list-items">
            {g.items.map((e) => (
              <button type="button" key={e.id} className={`cal-list-item k-${e.kind}`} onClick={() => onPick(e)}>
                <i />
                <span className="tm">{e.allDay ? tx("All day") : `${timeOf(e.start)} – ${timeOf(e.end)}`}</span>
                <span className="tt"><b>{e.title}</b>{e.who && <small>{e.who}{e.where ? " · " + e.where : ""}</small>}</span>
                <span className={`cal-tag k-${e.kind}`}>{{ session: tx("Session"), shoot: tx("Shoot"), due: e.late ? tx("Overdue") : tx("Payment due"), google: tx("Google") }[e.kind]}</span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// The whole year: 12 small months, busy days marked, how much is on each month
function Year({ cursor, now, events, openDay, openMonth }) {
  const y = cursor.getFullYear();
  const byDay = {};
  events.forEach((e) => { const k = isoDay(e.start); (byDay[k] = byDay[k] || new Set()).add(e.kind); });
  return (
    <div className="cal-year">
      {Array.from({ length: 12 }, (_, mi) => {
        const m = new Date(y, mi, 1), start = startOfWeek(m);
        const weeks = Math.ceil(((m - start) / DAY + new Date(y, mi + 1, 0).getDate()) / 7);
        const n = events.filter((e) => e.start.getFullYear() === y && e.start.getMonth() === mi && (e.kind === "session" || e.kind === "shoot")).length;
        const isNow = now.getFullYear() === y && now.getMonth() === mi;
        return (
          <div key={mi} className={`cal-ym${isNow ? " now" : ""}`}>
            <button type="button" className="cal-ym-head" onClick={() => openMonth(m)}><b>{fmt({ month: "long" }).format(m)}</b>{n > 0 && <small>{txn(n, "{n} session", "{n} sessions")}</small>}</button>
            <div className="cal-ym-grid">
              {Array.from({ length: 7 }, (_, i) => <small key={i}>{fmt({ weekday: "narrow" }).format(addD(start, i))}</small>)}
              {Array.from({ length: weeks * 7 }, (_, i) => addD(start, i)).map((d) => {
                const kinds = byDay[isoDay(d)];
                return d.getMonth() !== mi ? <span key={+d} /> : (
                  <button type="button" key={+d} className={`${sameDay(d, now) ? "today" : ""} ${kinds ? "busy" : ""}`} onClick={() => openDay(d)} title={kinds ? [...kinds].map((k) => tx(KINDS.find((x) => x[0] === k)[1])).join(", ") : undefined}>
                    {d.getDate()}{kinds && <span className="ym-dots">{[...kinds].slice(0, 3).map((k) => <i key={k} className={`k-${k}`} />)}</span>}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function MiniMonth({ cursor, now, events, onPickDay }) {
  const [m, setM] = useState(new Date(cursor.getFullYear(), cursor.getMonth(), 1));
  useEffect(() => { setM(new Date(cursor.getFullYear(), cursor.getMonth(), 1)); }, [cursor]);
  const start = startOfWeek(m);
  const days = Array.from({ length: 42 }, (_, i) => addD(start, i));
  const busy = new Set(events.map((e) => isoDay(e.start)));
  return (
    <div className="card cal-mini">
      <div className="cal-mini-head">
        <b>{fmt({ month: "long", year: "numeric" }).format(m)}</b>
        <span><button type="button" className="cal-arrow sm" onClick={() => setM(new Date(m.getFullYear(), m.getMonth() - 1, 1))} aria-label={tx("Previous month")}><Icon name="arrow" /></button>
          <button type="button" className="cal-arrow sm next" onClick={() => setM(new Date(m.getFullYear(), m.getMonth() + 1, 1))} aria-label={tx("Next month")}><Icon name="arrow" /></button></span>
      </div>
      <div className="cal-mini-grid">
        {Array.from({ length: 7 }, (_, i) => <small key={i}>{fmt({ weekday: "narrow" }).format(addD(start, i))}</small>)}
        {days.map((d) => (
          <button type="button" key={+d} onClick={() => onPickDay(d)} className={`${d.getMonth() !== m.getMonth() ? "out" : ""} ${sameDay(d, now) ? "today" : ""} ${sameDay(d, cursor) ? "sel" : ""}`}>
            {d.getDate()}{busy.has(isoDay(d)) && <i />}
          </button>
        ))}
      </div>
    </div>
  );
}

function EventCard({ e, onClose, openProject, openInvoice, cancel }) {
  useEffect(() => { const k = (x) => x.key === "Escape" && onClose(); window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [onClose]);
  const r = e.raw;
  const when = e.allDay ? fmt({ weekday: "long", day: "numeric", month: "long" }).format(e.start)
    : `${fmt({ weekday: "long", day: "numeric", month: "long" }).format(e.start)} · ${timeOf(e.start)} – ${timeOf(e.end)}`;
  const label = { session: tx("Session"), shoot: tx("Shoot day"), due: e.late ? tx("Payment overdue") : tx("Payment due"), google: tx("From Google Calendar") }[e.kind];
  return (
    <div className="scrim modal-wrap" onMouseDown={(x) => x.target === x.currentTarget && onClose()}>
      <div className={`modal cal-card k-${e.kind}`} role="dialog" aria-modal="true" aria-label={e.title}>
        <div className="cal-card-band"><span className="cal-tag">{label}</span><button type="button" className="x" onClick={onClose} aria-label={tx("Close")}><Icon name="x" /></button></div>
        <h2 className="h-m">{e.title}</h2>
        <div className="cal-card-rows">
          <p><Icon name="clock" />{when}</p>
          {e.who && <p><Icon name="users" />{e.who}</p>}
          {e.where && <p><Icon name="today" />{e.where}</p>}
          {e.kind === "session" && e.synced && <p className="sub"><Icon name="check" />{tx("Also in Google Calendar")}</p>}
          {e.kind === "due" && <p><Icon name="receipt" />{tx("Invoice #{number}", { number: r.number })}{r.label ? " · " + r.label : ""}</p>}
          {e.kind === "google" && <p className="sub">{tx("Shown so you don't double-book. Edit it in Google Calendar.")}</p>}
        </div>
        <div className="cal-card-acts">
          {e.kind === "session" && r.project_id && <button type="button" className="btn btn-secondary btn-sm" onClick={() => openProject(r.project_id)}><Icon name="folder" />{tx("Open project")}</button>}
          {e.kind === "shoot" && <button type="button" className="btn btn-secondary btn-sm" onClick={() => openProject(r.id)}><Icon name="folder" />{tx("Open project")}</button>}
          {e.kind === "due" && <button type="button" className="btn btn-primary btn-sm" onClick={() => openInvoice(r.id)}><Icon name="receipt" />{tx("Open invoice")}</button>}
          {e.kind === "session" && <button type="button" className="btn btn-ghost btn-sm danger-text" onClick={() => cancel(r)}><Icon name="x" />{tx("Cancel booking")}</button>}
        </div>
      </div>
    </div>
  );
}
