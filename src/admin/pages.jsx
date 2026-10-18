import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "./api";
import Icon from "./Icon";
import { SmileMark } from "./Celebrate";
import { BarList } from "./charts";
import { useOverview, RangePicker, RANGES } from "./Overview";
import { COUNTRY, EVENT, LANG, PLANS, PLAN_LABEL, SYM, ago, byValue, date, download, eventText, initials, money, n, timeLeft, toCSV } from "./util";

const PAGE = 50;
const Pill = ({ plan }) => <span className={`pill p-${plan}`}><i />{PLAN_LABEL[plan] || plan}</span>;
function Status({ s }) {
  if (s.suspended) return <span className="pill p-bad">Suspended</span>;
  if (s.plan_status === "past_due") return <span className="pill p-warn">Payment due</span>;
  if (s.plan_status === "cancelled") return <span className="pill p-bad">Cancelled</span>;
  if (s.plan_status === "gift") return <span className="pill p-info" title="Free access you gave">Gift{s.plan_until ? ` · until ${date(new Date(new Date(s.plan_until).getTime() - 864e5))}` : ""}</span>;
  if (!s.onboarded) return <span className="pill p-info">Setting up</span>;
  return <span className="pill p-good">Active</span>;
}
const Toggle = ({ on, onChange, label }) => <button type="button" role="switch" className="toggle" aria-checked={!!on} aria-label={label} onClick={() => onChange(!on)} />;

/* ---------------- Gift access: give Pro or Studio free for a while ---------------- */
const addMonths = (m) => { const d = new Date(); d.setMonth(d.getMonth() + m); return d.toISOString().slice(0, 10); };
export function Gifts({ ctx }) {
  const { sample } = ctx;
  const [f, setF] = useState({ emails: "", plan: "pro", len: "1", until: addMonths(1), note: "" });
  const [list, setList] = useState(null);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => api.gifts(sample).then(setList).catch((e) => { setList([]); setMsg({ bad: true, text: /admin_gifts/.test(e.message) ? "Run update 10 in Supabase first (RUN-UPDATE-10.sql)." : e.message }); }), [sample]);
  useEffect(() => { load(); }, [load]);
  const emails = [...new Set(f.emails.split(/[\s,;]+/).map((x) => x.trim().toLowerCase()).filter(Boolean))];
  const bad = emails.filter((x) => !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x));
  const setLen = (len) => setF({ ...f, len, until: len === "custom" ? f.until : len.endsWith("w") ? new Date(Date.now() + Number(len.slice(0, -1)) * 7 * 864e5).toISOString().slice(0, 10) : addMonths(Number(len)) });
  const give = async (e) => {
    e.preventDefault(); setMsg(null);
    if (sample) return setMsg({ bad: true, text: "Turn off sample data to give real access." });
    if (!emails.length) return setMsg({ bad: true, text: "Add at least one email." });
    if (bad.length) return setMsg({ bad: true, text: `Check these: ${bad.join(", ")}` });
    setBusy(true);
    try {
      const r = await api.giftPlan(emails, f.plan, f.until, f.note.trim());
      setMsg({ text: `${PLAN_LABEL[f.plan]} until ${date(f.until)}: ${r.now ? `${r.now} on Jovita already have it now` : ""}${r.now && r.waiting ? ", " : ""}${r.waiting ? `${r.waiting} will get it when they sign up with that email` : ""}.` });
      setF({ ...f, emails: "", note: "" }); load();
    } catch (x) { setMsg({ bad: true, text: x.message }); }
    setBusy(false);
  };
  const STATE = { on: ["p-good", "Using it"], waiting: ["p-warn", "Not signed up yet"], ended: ["p-bad", "Ended"] };
  const signup = "https://app.getjovita.com/signup";
  return (
    <>
      <div className="page-head"><div><p className="eyebrow">Gift access</p><h1 className="h-l" style={{ marginTop: 6 }}>Let people try Pro or Studio</h1><p className="sub">Free access for a set time, for testers, friends and partners. They don't count as paying, and go back to Free on the end date.</p></div></div>
      <div className="grid g-2">
        <form className="card" onSubmit={give} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <h2 className="h-m">Give access</h2>
          <div className="field"><label htmlFor="gf-e">Emails</label><textarea id="gf-e" className="a-textarea" rows={4} value={f.emails} onChange={(e) => setF({ ...f, emails: e.target.value })} placeholder={"ada@mail.com\nbayo@mail.com, kemi@mail.com"} />
            <small className="sub" style={{ fontSize: 12 }}>{emails.length ? `${emails.length} ${emails.length === 1 ? "person" : "people"}${bad.length ? ` · ${bad.length} to fix` : ""}` : "One per line, or separated by commas. Use the email they sign up with."}</small></div>
          <div className="field"><label>Plan</label><div className="seg" role="group" aria-label="Plan"><button type="button" aria-pressed={f.plan === "pro"} onClick={() => setF({ ...f, plan: "pro" })}>Pro</button><button type="button" aria-pressed={f.plan === "studio"} onClick={() => setF({ ...f, plan: "studio" })}>Studio</button></div></div>
          <div className="field"><label>For how long</label>
            <div className="seg" role="group" aria-label="For how long" style={{ flexWrap: "wrap" }}>{[["2w", "2 weeks"], ["1", "1 month"], ["3", "3 months"], ["6", "6 months"], ["12", "1 year"], ["custom", "Pick a date"]].map(([k, l]) => <button key={k} type="button" aria-pressed={f.len === k} onClick={() => setLen(k)}>{l}</button>)}</div>
            {f.len === "custom" ? <input type="date" className="a-input" style={{ marginTop: 8, maxWidth: 220 }} min={new Date().toISOString().slice(0, 10)} value={f.until} onChange={(e) => setF({ ...f, until: e.target.value })} />
              : <small className="sub" style={{ fontSize: 12 }}>Until {date(f.until)}</small>}</div>
          <div className="field"><label htmlFor="gf-n">Note for you (optional)</label><input id="gf-n" className="a-input" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="Beta testers, October" /></div>
          {msg && <p className={msg.bad ? "err" : "sub"} style={msg.bad ? {} : { color: "var(--good, #2E8B57)", fontWeight: 600 }}>{msg.text}</p>}
          <button className="a-btn a-btn-primary" disabled={busy} style={{ alignSelf: "flex-start" }}><Icon name="gift" />{busy ? "Giving…" : `Give ${PLAN_LABEL[f.plan]}${emails.length > 1 ? ` to ${emails.length} people` : ""}`}</button>
          <p className="sub" style={{ fontSize: 12 }}>Tell them to sign up at <a href={signup} target="_blank" rel="noreferrer">app.getjovita.com/signup</a> with that email. People already on Jovita get it the next time they open the app.</p>
        </form>
        <section className="card">
          <div className="row" style={{ justifyContent: "space-between", marginBottom: 12 }}><h2 className="h-m">Given</h2>{list?.length ? <span className="sub" style={{ fontSize: 13 }}>{list.filter((g) => g.state === "on").length} using · {list.filter((g) => g.state === "waiting").length} not signed up</span> : null}</div>
          {list === null ? <p className="sub">Loading…</p> : list.length ? list.map((g) => (
            <div key={g.id} className="switch" style={{ marginBottom: 10 }}>
              <div style={{ minWidth: 0 }}><b style={{ overflowWrap: "anywhere" }}>{g.studio || g.email}</b>
                <p className="sub" style={{ fontSize: 13 }}>{g.studio ? `${g.email} · ` : ""}<Pill plan={g.plan} /> until {date(g.until)}</p>
                <small className="sub" style={{ fontSize: 12 }}><span className={`pill ${STATE[g.state][0]}`}>{STATE[g.state][1]}</span>{g.note ? ` · ${g.note}` : ""}</small></div>
              <button type="button" className="a-btn a-btn-sm a-btn-ghost" onClick={async () => { if (!window.confirm(g.state === "on" ? `Take ${PLAN_LABEL[g.plan]} back from ${g.email}? Their studio goes back to Free now.` : `Remove the gift for ${g.email}?`)) return; await api.cancelGift(g.id); load(); }}>{g.state === "on" ? "Take back" : "Remove"}</button>
            </div>
          )) : <div className="empty"><b>No gifts yet</b><span>Give someone Pro or Studio to try, and they'll show here.</span></div>}
        </section>
      </div>
    </>
  );
}

/* ---------------- Studios ---------------- */
export function Studios({ ctx }) {
  const { sample, search, setSearch, openStudio, setOpenStudio } = ctx;
  const [plan, setPlan] = useState("");
  const [page, setPage] = useState(0);
  const [res, setRes] = useState({ total: 0, rows: [] });
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);
  const [counts, setCounts] = useState(null);
  const load = useCallback(() => {
    setLoading(true);
    api.studios({ search, plan, limit: PAGE, offset: page * PAGE }, sample).then((r) => { setRes(r); setErr(""); }).catch((e) => setErr(e.message)).finally(() => setLoading(false));
  }, [search, plan, page, sample]);
  useEffect(() => { const t = setTimeout(load, 200); return () => clearTimeout(t); }, [load]);
  useEffect(() => { setPage(0); }, [search, plan, sample]);
  useEffect(() => { api.overview(0, sample).then((d) => setCounts(d.plans)).catch(() => {}); }, [sample]);
  const exportCSV = async () => {
    const rows = await api.allStudios(sample);
    download(`jovita-studios-${new Date().toISOString().slice(0, 10)}.csv`, toCSV(rows, [["name", "Studio"], ["owner_first_name", "Owner"], ["email", "Email"], ["plan", "Plan"], ["plan_status", "Plan status"], [(r) => (r.suspended ? "yes" : "no"), "Suspended"], ["country", "Country"], ["home_currency", "Currency"], ["language", "Language"], [(r) => (r.careers || []).join("; "), "Careers"], ["created_at", "Joined"], ["last_sign_in_at", "Last signed in"], ["clients", "Clients"], ["projects", "Projects"], ["invoices", "Invoices"], ["galleries", "Galleries"], ["months_paid", "Months paid"], [(r) => (r.plan_until ? new Date(r.plan_until).toISOString().slice(0, 10) : ""), "Plan ends"], ["actions_30d", "Actions (30 days)"]]));
  };
  const total = counts ? counts.free + counts.pro + counts.studio : null;
  const selected = res.rows.find((r) => r.id === openStudio);
  return (
    <>
      <div className="page-head">
        <div><p className="eyebrow">Studios</p><h1 className="h-l" style={{ marginTop: 6 }}>Everyone on Jovita</h1><p className="sub">{n(res.total)} {search || plan ? "matching" : "studios"}. Click a studio to see more or change its plan.</p></div>
        <button type="button" className="a-btn a-btn-ghost" onClick={exportCSV}><Icon name="download" />Export CSV</button>
      </div>
      <div className="filters">
        <label className="hq-search" style={{ width: 320 }}><Icon name="search" /><span className="sr">Search</span><input placeholder="Name or email" value={search} onChange={(e) => setSearch(e.target.value)} /></label>
        <div className="chips" role="group" aria-label="Plan">
          <button type="button" aria-pressed={!plan} onClick={() => setPlan("")}>All <small>{total != null ? n(total) : ""}</small></button>
          {PLANS.map(([k, l]) => <button key={k} type="button" aria-pressed={plan === k} onClick={() => setPlan(k)}><i style={{ width: 8, height: 8, borderRadius: 99, background: `var(--${k})` }} />{l} <small>{counts ? n(counts[k]) : ""}</small></button>)}
        </div>
      </div>
      {err ? <div className="card empty"><b>Couldn't load studios</b><p className="sub">{err}</p></div> : (
        <div className="card table-card" style={{ opacity: loading ? 0.6 : 1 }}>
          <div className="tscroll">
            <table className="t">
              <thead><tr><th>Studio</th><th>Plan</th><th>Status</th><th>Where</th><th>Joined</th><th>Last seen</th><th className="r">Months paid</th><th>Time left</th><th className="r">Actions (30d)</th></tr></thead>
              <tbody>
                {res.rows.map((s) => {
                  const left = timeLeft(s.plan_until);
                  return (
                    <tr key={s.id} onClick={() => setOpenStudio(s.id)} tabIndex={0} onKeyDown={(e) => e.key === "Enter" && setOpenStudio(s.id)}>
                      <td><div className="st"><span className="lg">{initials(s.name)}</span><div><b>{s.name}</b><small>{s.email}</small></div></div></td>
                      <td><Pill plan={s.plan} /></td><td><Status s={s} /></td>
                      <td>{COUNTRY[s.country] || s.country || "—"} <span className="sub">· {s.home_currency}</span></td>
                      <td>{date(s.created_at)}</td><td>{ago(s.last_sign_in_at)}</td>
                      <td className="r num">{s.months_paid ? n(s.months_paid) : "—"}</td>
                      <td>{s.plan === "free" ? <span className="sub">—</span> : left ? <span className={`pill ${left.tone}`}>{left.text}</span> : <span className="sub">No end date</span>}</td>
                      <td className="r num">{s.actions_30d != null ? n(s.actions_30d) : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {!res.rows.length && !loading && <div className="empty"><b>No studios found</b><span>Try another name or plan.</span></div>}
          </div>
          <div className="t-foot">
            <span>{res.total ? `${page * PAGE + 1}–${Math.min(res.total, (page + 1) * PAGE)} of ${n(res.total)}` : ""}</span>
            <div className="row"><button className="a-btn a-btn-sm a-btn-ghost" disabled={!page} onClick={() => setPage(page - 1)}>Previous</button><button className="a-btn a-btn-sm a-btn-ghost" disabled={(page + 1) * PAGE >= res.total} onClick={() => setPage(page + 1)}>Next</button></div>
          </div>
        </div>
      )}
      {openStudio && <StudioDrawer key={openStudio} studio={selected} id={openStudio} sample={sample} onClose={() => setOpenStudio(null)} onSaved={load} />}
    </>
  );
}

/* A studio's subscription: months paid, time left, and record more time */
function Subscription({ s, sample, onChanged }) {
  const [periods, setPeriods] = useState(null);
  const [f, setF] = useState({ plan: s.plan === "free" ? "pro" : s.plan, months: 1 });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const load = useCallback(() => api.periods(s.id, sample).then(setPeriods).catch(() => setPeriods([])), [s.id, sample]);
  useEffect(() => { load(); }, [load]);
  const left = timeLeft(s.plan_until);
  const paid = (periods || []).filter((p) => p.source !== "gift").reduce((a, p) => a + p.months, 0);
  const first = (periods || []).length ? periods[periods.length - 1].starts_at : null;
  const total = left && s.plan_until && first ? Math.max(1, (new Date(s.plan_until) - new Date(first)) / 864e5) : 0;
  const pct = left && total ? Math.max(0, Math.min(100, (left.days / total) * 100)) : 0;
  const add = async () => {
    if (sample) return setMsg("Turn off sample data first.");
    setBusy(true); setMsg("");
    try { const r = await api.addPeriod(s.id, f.plan, f.months); setMsg(`Added. ${PLAN_LABEL[f.plan]} until ${date(r.until)}.`); load(); onChanged(); }
    catch (e) { setMsg(/admin_add_period/.test(e.message) ? "Run update 12 in Supabase first." : e.message); }
    setBusy(false);
  };
  return (
    <div className="card sub-card">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div><small className="sub" style={{ fontSize: 12, fontWeight: 700 }}>SUBSCRIPTION</small>
          <h3 className="h-m" style={{ margin: "4px 0 0" }}>{s.plan === "free" ? "Free plan" : `${PLAN_LABEL[s.plan]}${s.plan_status === "gift" ? " (gift)" : s.plan_status === "trialing" ? " (trial)" : ""}`}</h3></div>
        {s.plan !== "free" && (left ? <span className={`pill ${left.tone}`}>{left.text}</span> : <span className="pill p-info">No end date</span>)}
      </div>
      {left && <div className="sub-bar" aria-hidden="true"><i style={{ width: `${pct}%` }} className={left.tone} /></div>}
      <div className="stat-grid" style={{ marginTop: 12 }}>
        <div><small>Months paid</small><b className="num">{paid}</b></div>
        <div><small>Paid until</small><b style={{ fontSize: 15 }}>{s.plan_until ? date(s.plan_until) : "—"}</b></div>
        <div><small>Customer since</small><b style={{ fontSize: 15 }}>{first ? date(first) : "—"}</b></div>
        <div><small>Actions (30 days)</small><b className="num">{s.actions_30d != null ? n(s.actions_30d) : "—"}</b></div>
      </div>
      <div className="sub-add">
        <b style={{ fontSize: 14 }}>Record a payment</b>
        <div className="row">
          <div className="seg" role="group" aria-label="Plan"><button type="button" aria-pressed={f.plan === "pro"} onClick={() => setF({ ...f, plan: "pro" })}>Pro</button><button type="button" aria-pressed={f.plan === "studio"} onClick={() => setF({ ...f, plan: "studio" })}>Studio</button></div>
          <div className="seg" role="group" aria-label="Months">{[1, 3, 6, 12].map((m) => <button key={m} type="button" aria-pressed={f.months === m} onClick={() => setF({ ...f, months: m })}>{m === 12 ? "1 year" : `${m} mo`}</button>)}</div>
          <button type="button" className="a-btn a-btn-primary a-btn-sm" disabled={busy} onClick={add}>{busy ? "Adding…" : "Add"}</button>
        </div>
        <span className="sub" style={{ fontSize: 12 }}>Adds on top of any time they still have. They get reminder emails 7 days, 3 days and 1 day before it ends.</span>
        {msg && <span className="sub" style={{ fontSize: 13, fontWeight: 600 }}>{msg}</span>}
      </div>
      {periods?.length > 0 && <ul className="sub-periods">{periods.map((p) => (
        <li key={p.id}><span className={`dot-k ${p.source}`} /><span><b>{PLAN_LABEL[p.plan]} · {p.source === "gift" ? "gift" : `${p.months} ${p.months === 1 ? "month" : "months"}`}</b><small>{date(p.starts_at)} → {date(p.ends_at)}</small></span>
          {p.source !== "gift" && <button type="button" className="a-btn a-btn-sm a-btn-ghost" onClick={async () => { if (!window.confirm("Remove this payment record? Their end date moves back.")) return; await api.removePeriod(p.id); load(); onChanged(); }}>Remove</button>}</li>
      ))}</ul>}
    </div>
  );
}

/* Revenue: plans that end in the next 14 days (to follow up) */
function EndingSoon({ sample }) {
  const [rows, setRows] = useState(null);
  useEffect(() => { api.allStudios(sample).then((all) => setRows(all.filter((s) => s.plan !== "free" && s.plan_until && new Date(s.plan_until) - Date.now() < 14 * 864e5).sort((a, b) => new Date(a.plan_until) - new Date(b.plan_until)))).catch(() => setRows([])); }, [sample]);
  return (
    <section className="card">
      <div className="card-head"><div><h2 className="h-m">Ending soon</h2><p className="sub">Plans that end in the next 14 days. Reminder emails go out on their own.</p></div></div>
      {rows === null ? <p className="sub">Loading…</p> : rows.length ? rows.map((s) => { const left = timeLeft(s.plan_until); return (
        <div key={s.id} className="switch" style={{ marginBottom: 8 }}><div style={{ minWidth: 0 }}><b>{s.name}</b><p className="sub" style={{ fontSize: 13 }}>{PLAN_LABEL[s.plan]}{s.plan_status === "gift" ? " gift" : ""} · ends {date(s.plan_until)}</p></div><span className={`pill ${left.tone}`}>{left.text}</span></div>
      ); }) : <div className="empty"><b>Nothing ending soon</b><span>Studios whose plan ends in the next 14 days show here.</span></div>}
    </section>
  );
}

function StudioDrawer({ studio: given, id, sample, onClose, onSaved }) {
  const [s, setS] = useState(given || null);
  const [events, setEvents] = useState([]);
  const [f, setF] = useState(null);
  const [saved, setSaved] = useState("");
  useEffect(() => { if (!given) api.allStudios(sample).then((all) => setS(all.find((x) => x.id === id) || null)); }, [given, id, sample]);
  useEffect(() => { if (s) setF({ plan: s.plan, plan_status: s.plan_status, suspended: s.suspended, admin_note: s.admin_note || "" }); }, [s]);
  useEffect(() => { api.studioEvents(id, sample).then(setEvents).catch(() => setEvents([])); }, [id, sample]);
  useEffect(() => { const k = (e) => e.key === "Escape" && onClose(); addEventListener("keydown", k); return () => removeEventListener("keydown", k); }, [onClose]);
  const save = async (patch) => {
    const next = { ...f, ...patch }; setF(next);
    try { await api.updateStudio(id, patch, sample); setSaved(sample ? "Preview only, nothing saved" : "Saved"); onSaved(); setTimeout(() => setSaved(""), 2000); } catch (e) { setSaved(e.message); }
  };
  return (
    <>
      <div className="scrim" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-modal="true" aria-label={s?.name || "Studio"}>
        {!s || !f ? <div className="loading">Loading…</div> : (
          <>
            <div className="drawer-head">
              <span className="lg">{initials(s.name)}</span>
              <div style={{ flex: 1, minWidth: 0 }}><h2 className="h-m">{s.name}</h2><p className="sub" style={{ fontSize: 13 }}>{s.owner_first_name} · {s.email}</p></div>
              <button type="button" className="icon-btn" onClick={onClose} aria-label="Close"><Icon name="x" /></button>
            </div>
            <div className="drawer-body">
              <div className="row"><Pill plan={f.plan} /><Status s={{ ...s, ...f }} />{saved && <span className="sub" style={{ fontSize: 13 }}>{saved}</span>}</div>
              <div className="stat-grid">
                <div><small>Clients</small><b className="num">{n(s.clients)}</b></div><div><small>Projects</small><b className="num">{n(s.projects)}</b></div>
                <div><small>Invoices</small><b className="num">{n(s.invoices)}</b></div><div><small>Galleries</small><b className="num">{n(s.galleries)}</b></div>
              </div>
              <Subscription s={s} sample={sample} onChanged={() => { onSaved(); api.allStudios(sample).then((all) => setS(all.find((x) => x.id === id) || s)); }} />
              <div className="stat-grid">
                <div><small>Joined</small><b style={{ fontSize: 15 }}>{date(s.created_at)}</b></div><div><small>Last signed in</small><b style={{ fontSize: 15 }}>{ago(s.last_sign_in_at)}</b></div>
                <div><small>Where</small><b style={{ fontSize: 15 }}>{COUNTRY[s.country] || s.country || "—"} · {s.home_currency}</b></div><div><small>Language</small><b style={{ fontSize: 15 }}>{LANG[s.language || "auto"] || s.language}</b></div>
              </div>
              {s.careers?.length > 0 && <div className="row">{s.careers.map((c) => <span key={c} className="pill p-info">{c}</span>)}</div>}
              <h3 className="h-m">Plan</h3>
              <div className="row">
                <div className="seg" role="group" aria-label="Plan">{PLANS.map(([k, l]) => <button key={k} type="button" aria-pressed={f.plan === k} onClick={() => save({ plan: k })}>{l}</button>)}</div>
                <select className="a-select" value={f.plan_status} onChange={(e) => save({ plan_status: e.target.value })} aria-label="Plan status">
                  <option value="active">Active</option><option value="trialing">Trial</option><option value="past_due">Payment due</option><option value="cancelled">Cancelled</option>
                </select>
              </div>
              <p className="sub" style={{ fontSize: 13, marginTop: -8 }}>Use this for comps and fixes. Once billing is connected, plans change automatically when studios pay.</p>
              <div className="switch"><div><b>Suspend this studio</b><p className="sub" style={{ fontSize: 13 }}>They can't sign in to their studio while suspended. Their clients' links keep working.</p></div><Toggle on={f.suspended} label="Suspend" onChange={(v) => save({ suspended: v })} /></div>
              <div className="field"><label htmlFor="note">Private note</label><textarea id="note" className="a-textarea" value={f.admin_note} onChange={(e) => setF({ ...f, admin_note: e.target.value })} onBlur={() => f.admin_note !== (s.admin_note || "") && save({ admin_note: f.admin_note })} placeholder="Only Jovita HQ sees this" /><span className="help">Saves when you click away.</span></div>
              <h3 className="h-m">History</h3>
              <ul className="timeline">
                {events.map((e, i) => <li key={i}><b>{(EVENT[e.kind] || [e.kind])[0]}</b>{eventText(e) && <span className="sub"> · {eventText(e)}</span>}<small>{new Date(e.at).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</small></li>)}
                {!events.length && <li className="sub">No history yet.</li>}
              </ul>
              <p className="sub" style={{ fontSize: 12 }}>HQ shows account details only. Clients, photos and messages stay private to the studio.</p>
            </div>
          </>
        )}
      </aside>
    </>
  );
}

/* ---------------- Revenue ---------------- */

/* Offers: a % off you set here shows on the website and the app's plan screens, for new subscribers only */
function offerLive(o) { const now = Date.now(); return o.active && new Date(o.starts_at).getTime() <= now && (!o.ends_at || new Date(o.ends_at).getTime() > now); }
function Offers({ sample, prices }) {
  const [list, setList] = useState(null);
  const [f, setF] = useState({ plan: "pro", percent_off: 20, label: "Launch offer", months: "3", ends: "" });
  const [err, setErr] = useState("");
  useEffect(() => { api.offers(sample).then(setList).catch((e) => { setList([]); setErr(e.message.includes("plan_offers") ? "Run the latest Jovita update in Supabase to use offers." : e.message); }); }, [sample]);
  const ngn = (plan) => prices.find((x) => x.plan === plan && x.currency === "NGN")?.monthly_amount;
  const add = async (e) => {
    e.preventDefault(); setErr("");
    const row = { plan: f.plan, percent_off: Math.max(1, Math.min(90, Number(f.percent_off) || 0)), label: f.label.trim().slice(0, 60), months: f.months ? Number(f.months) : null, ends_at: f.ends ? new Date(f.ends + "T23:59:59").toISOString() : null };
    if (sample) { setList((l) => [{ ...row, id: Math.random().toString(36), active: true, starts_at: new Date().toISOString(), created_at: new Date().toISOString() }, ...(l || [])]); return; }
    try { const o = await api.addOffer(row); setList((l) => [o, ...(l || [])]); } catch (x) { setErr(x.message); }
  };
  const stop = async (o) => { setList((l) => l.map((x) => (x.id === o.id ? { ...x, active: false } : x))); if (!sample) await api.updateOffer(o.id, { active: false }).catch((x) => setErr(x.message)); };
  const preview = ngn(f.plan) ? `${money(ngn(f.plan), "NGN", false)} → ${money(Math.round(ngn(f.plan) * (100 - (Number(f.percent_off) || 0)) / 100), "NGN", false)}` : "";
  return (
    <section className="card">
      <div className="card-head"><div><h2 className="h-m">Offers</h2><p className="sub">A discount here shows on the website and on the plans screen in the app. Only new subscribers get it. Studios already paying keep their price.</p></div></div>
      <form className="offer-form" onSubmit={add}>
        <label className="field"><span>Plan</span><select className="a-input" value={f.plan} onChange={(e) => setF({ ...f, plan: e.target.value })}><option value="pro">Pro</option><option value="studio">Studio</option></select></label>
        <label className="field"><span>% off</span><input className="a-input" type="number" min="1" max="90" value={f.percent_off} onChange={(e) => setF({ ...f, percent_off: e.target.value })} required /></label>
        <label className="field"><span>Name shown</span><input className="a-input" value={f.label} maxLength={60} onChange={(e) => setF({ ...f, label: e.target.value })} placeholder="Launch offer" /></label>
        <label className="field"><span>For how long</span><select className="a-input" value={f.months} onChange={(e) => setF({ ...f, months: e.target.value })}><option value="1">First month</option><option value="3">First 3 months</option><option value="6">First 6 months</option><option value="12">First year</option><option value="">As long as they stay</option></select></label>
        <label className="field"><span>Offer ends</span><input className="a-input" type="date" value={f.ends} min={new Date().toISOString().slice(0, 10)} onChange={(e) => setF({ ...f, ends: e.target.value })} /></label>
        <div className="offer-go"><button className="a-btn a-btn-gold">Start offer</button>{preview && <small className="sub">{preview}</small>}</div>
      </form>
      {err && <p className="err">{err}</p>}
      {list?.length ? (
        <ul className="offer-list">{list.map((o) => {
          const live = offerLive(o);
          return (
            <li key={o.id}>
              <span className={`pill ${live ? "p-good" : ""}`}>{live ? "Live" : o.active && new Date(o.starts_at) > new Date() ? "Scheduled" : "Ended"}</span>
              <b>{o.percent_off}% off {PLAN_LABEL[o.plan]}</b>
              <span className="sub">{o.label || "No name"} · {o.months ? `first ${o.months === 1 ? "month" : o.months + " months"}` : "for as long as they stay"} · {o.ends_at ? `ends ${date(o.ends_at)}` : "no end date"}</span>
              {live && <button type="button" className="a-btn a-btn-sm a-btn-ghost" onClick={() => stop(o)}>End now</button>}
            </li>
          );
        })}</ul>
      ) : list && <p className="sub">No offers yet.</p>}
    </section>
  );
}

export function Revenue({ ctx }) {
  const { sample, days, setDays } = ctx;
  const { data: d } = useOverview(days, sample);
  const [prices, setPrices] = useState([]);
  const [billing, setBilling] = useState([]);
  const [msg, setMsg] = useState("");
  useEffect(() => { api.prices().then(setPrices).catch(() => {}); api.billing(sample).then(setBilling).catch(() => setBilling([])); }, [sample]);
  const curs = ["NGN", "GBP", "USD", "EUR", "XOF"];
  const price = (p, c) => prices.find((x) => x.plan === p && x.currency === c)?.monthly_amount ?? "";
  const setPrice = async (plan, currency, v) => {
    const row = { plan, currency, monthly_amount: Number(v) || 0 };
    setPrices((l) => [...l.filter((x) => !(x.plan === plan && x.currency === currency)), row]);
    try { await api.savePrice(row); setMsg("Price saved"); } catch (e) { setMsg(e.message); }
    setTimeout(() => setMsg(""), 1800);
  };
  if (!d) return <div className="loading" style={{ minHeight: 300 }}>Loading…</div>;
  const mrr = byValue(d.mrr); const processed = byValue(d.processed);
  const arpu = d.paying && mrr.length ? mrr[0][1] / Math.max(1, d.paying) : 0;
  return (
    <>
      <div className="page-head">
        <div><p className="eyebrow">Revenue</p><h1 className="h-l" style={{ marginTop: 6 }}>Money made</h1><p className="sub">Jovita's subscription revenue, and whose plan ends soon.</p></div>
        <RangePicker days={days} setDays={setDays} />
      </div>
      <div className="grid g-kpi">
        <div className="card kpi hero"><span className="kpi-label">Monthly revenue (estimated)</span><span className="kpi-value">{mrr.length ? money(mrr[0][1], mrr[0][0]) : money(0)}</span><div className="kpi-extra">{mrr.slice(1).map(([c, v]) => <span key={c}>{money(v, c)}</span>)}</div><div className="kpi-foot">Paying studios × your plan prices</div></div>
        <div className="card kpi"><span className="kpi-label">Yearly run rate</span><span className="kpi-value">{mrr.length ? money(mrr[0][1] * 12, mrr[0][0]) : money(0)}</span><div className="kpi-foot">Monthly × 12, main currency</div></div>
        <div className="card kpi"><span className="kpi-label">Paying subscribers</span><span className="kpi-value">{n(d.paying)}</span><div className="kpi-foot">{n(d.plans?.pro)} Pro · {n(d.plans?.studio)} Studio</div></div>
        <div className="card kpi"><span className="kpi-label">Average per paying studio</span><span className="kpi-value">{mrr.length ? money(arpu, mrr[0][0]) : "—"}</span><div className="kpi-foot">per month, main currency</div></div>
        <div className="card kpi"><span className="kpi-label">Collected by billing</span><span className="kpi-value">{byValue(d.billing).length ? money(byValue(d.billing)[0][1], byValue(d.billing)[0][0]) : money(0)}</span><div className="kpi-foot">{d.billing_count ? `${n(d.billing_count)} payments` : "Paystack and Stripe connect later"}</div></div>
      </div>
      <div className="grid g-2">
        <section className="card">
          <div className="card-head"><div><h2 className="h-m">Plan prices</h2><p className="sub">Placeholders for now. Change them here and every estimate updates.</p></div>{msg && <span className="pill p-good">{msg}</span>}</div>
          {sample ? <p className="sub">Turn off sample data to edit your real prices.</p> : (
            <div className="tscroll"><table className="t price-table"><thead><tr><th>Currency</th><th className="r">Pro / month</th><th className="r">Studio / month</th></tr></thead>
              <tbody>{curs.map((c) => <tr key={c}><td><b>{c}</b> <span className="sub">{SYM[c]}</span></td>{["pro", "studio"].map((p) => <td key={p} className="r"><input type="number" min="0" defaultValue={price(p, c)} key={price(p, c)} aria-label={`${PLAN_LABEL[p]} price in ${c}`} onBlur={(e) => String(price(p, c)) !== e.target.value && setPrice(p, c, e.target.value)} /></td>)}</tr>)}</tbody></table></div>
          )}
        </section>
        <EndingSoon sample={sample} />
        <section className="card" hidden>
          <div className="card-head"><div><h2 className="h-m">Paid to studios by their clients</h2><p className="sub">Last {RANGES.find((r) => r[0] === days)?.[1].toLowerCase()}, by currency</p></div></div>
          {processed.length ? <BarList rows={processed.map(([c, v]) => ({ k: c, n: v }))} labels={{ NGN: "Naira", GBP: "Pounds", USD: "Dollars", EUR: "Euros", XOF: "CFA francs" }} format={(r) => money(r.n, r.k)} /> : <div className="empty">No paid invoices in this period yet.</div>}
        </section>
      </div>
      <Offers sample={sample} prices={prices} />
      <section className="card table-card">
        <div className="card-head" style={{ padding: "20px 22px 0" }}><div><h2 className="h-m">Subscription payments</h2><p className="sub">Every payment studios make to Jovita</p></div></div>
        {billing.length ? (
          <div className="tscroll"><table className="t"><thead><tr><th>Studio</th><th>Plan</th><th>Provider</th><th>Status</th><th>Date</th><th className="r">Amount</th></tr></thead>
            <tbody>{billing.map((b) => <tr key={b.id}><td>{b.studios?.name || "—"}</td><td><Pill plan={b.plan} /></td><td style={{ textTransform: "capitalize" }}>{b.provider}</td><td><span className={`pill ${b.status === "paid" ? "p-good" : b.status === "failed" ? "p-bad" : "p-warn"}`}>{b.status}</span></td><td>{date(b.paid_at)}</td><td className="r num">{money(b.amount, b.currency, false)}</td></tr>)}</tbody></table></div>
        ) : <div className="empty"><SmileMark size={44} /><b>No subscription payments yet</b><span>When you connect Paystack and Stripe, every Pro and Studio payment lands here automatically.</span></div>}
      </section>
    </>
  );
}

/* ---------------- Activity ---------------- */
export function Activity({ ctx }) {
  const { sample, setOpenStudio, go } = ctx;
  const [kind, setKind] = useState("");
  const [rows, setRows] = useState(null);
  useEffect(() => { setRows(null); api.events(kind, sample).then(setRows).catch(() => setRows([])); }, [kind, sample]);
  const list = useMemo(() => (rows || []).filter((e) => !kind || e.kind === kind), [rows, kind]);
  return (
    <>
      <div className="page-head"><div><p className="eyebrow">Activity</p><h1 className="h-l" style={{ marginTop: 6 }}>What's happening</h1><p className="sub">Signups, upgrades, invoices and galleries across every studio.</p></div></div>
      <div className="chips" role="group" aria-label="Filter">
        <button type="button" aria-pressed={!kind} onClick={() => setKind("")}>Everything</button>
        {["signup", "onboarded", "upgrade", "downgrade", "invoice_sent", "invoice_paid", "gallery_published", "client_added"].map((k) => <button key={k} type="button" aria-pressed={kind === k} onClick={() => setKind(k)}>{EVENT[k][0]}</button>)}
      </div>
      <section className="card">
        {rows === null ? <div className="loading" style={{ minHeight: 200 }}>Loading…</div> : list.length ? (
          <ul className="feed">
            {list.map((e, i) => { const [label, icon, cls] = EVENT[e.kind] || [e.kind, "pulse", ""]; return (
              <li key={e.id || i} onClick={() => { if (e.studio_id) { setOpenStudio(e.studio_id); go("studios"); } }} style={{ cursor: e.studio_id ? "pointer" : "default" }}>
                <span className={`fi ${cls}`}><Icon name={icon} /></span><p><b>{e.studios?.name || "A studio"}</b> · {label}{eventText(e) && <span className="sub"> · {eventText(e)}</span>}</p><small>{ago(e.created_at)}</small>
              </li>); })}
          </ul>
        ) : <div className="empty"><b>Nothing yet</b><span>Activity appears here as studios use Jovita.</span></div>}
      </section>
    </>
  );
}

/* ---------------- Announcements ---------------- */
export function Announcements({ ctx }) {
  const { sample } = ctx;
  const blank = { title: "", body: "", level: "info", audience: "all", link: "", active: true, ends_at: "" };
  const [list, setList] = useState(null);
  const [f, setF] = useState(blank);
  const [err, setErr] = useState("");
  const load = () => (sample ? Promise.resolve([{ id: "x", title: "New: invite people to your galleries", body: "Share a gallery with anyone by email and see who opened it.", level: "success", audience: "all", active: true, created_at: new Date().toISOString() }]) : api.announcements()).then(setList).catch((e) => { setErr(e.message); setList([]); });
  useEffect(() => { load(); }, [sample]); // eslint-disable-line react-hooks/exhaustive-deps
  const save = async (e) => {
    e.preventDefault(); if (!f.title.trim()) return setErr("Give the announcement a title.");
    if (sample) return setErr("Turn off sample data to publish a real announcement.");
    try { await api.saveAnnouncement({ ...f, ends_at: f.ends_at || null, link: f.link || null }); setF(blank); setErr(""); load(); } catch (x) { setErr(x.message); }
  };
  return (
    <>
      <div className="page-head"><div><p className="eyebrow">Announcements</p><h1 className="h-l" style={{ marginTop: 6 }}>Talk to every studio</h1><p className="sub">A banner at the top of the studio app. Use it for new features, maintenance or offers.</p></div></div>
      <div className="grid g-2">
        <form className="card" onSubmit={save} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <h2 className="h-m">New announcement</h2>
          <div className="field"><label htmlFor="at">Title</label><input id="at" className="a-input" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="New: invite people to your galleries" /></div>
          <div className="field"><label htmlFor="ab">Message</label><textarea id="ab" className="a-textarea" value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} placeholder="One or two short sentences." /></div>
          <div className="row">
            <div className="field" style={{ flex: 1 }}><label htmlFor="al">Style</label><select id="al" className="a-select" value={f.level} onChange={(e) => setF({ ...f, level: e.target.value })}><option value="info">News</option><option value="success">Good news</option><option value="warning">Heads-up</option></select></div>
            <div className="field" style={{ flex: 1 }}><label htmlFor="aa">Who sees it</label><select id="aa" className="a-select" value={f.audience} onChange={(e) => setF({ ...f, audience: e.target.value })}><option value="all">Everyone</option><option value="free">Free studios</option><option value="pro">Pro studios</option><option value="studio">Studio plan</option></select></div>
            <div className="field" style={{ flex: 1 }}><label htmlFor="ae">Ends</label><input id="ae" type="date" className="a-input" value={f.ends_at} onChange={(e) => setF({ ...f, ends_at: e.target.value })} /></div>
          </div>
          <div className="field"><label htmlFor="ak">Link (optional)</label><input id="ak" className="a-input" value={f.link} onChange={(e) => setF({ ...f, link: e.target.value })} placeholder="https://" /></div>
          <div className="field"><label>Preview</label><div className={`ann-preview ${f.level}`}><SmileMark size={22} /><div><b>{f.title || "Your title"}</b>{f.body && <span> · {f.body}</span>}</div></div></div>
          {err && <p className="err">{err}</p>}
          <button className="a-btn a-btn-primary" style={{ alignSelf: "flex-start" }}><Icon name="mega" />Publish to studios</button>
        </form>
        <section className="card">
          <h2 className="h-m" style={{ marginBottom: 12 }}>Published</h2>
          {list === null ? <p className="sub">Loading…</p> : list.length ? list.map((a) => (
            <div key={a.id} className="switch" style={{ marginBottom: 10 }}>
              <div style={{ minWidth: 0 }}><b>{a.title}</b><p className="sub" style={{ fontSize: 13 }}>{a.body}</p><small className="sub" style={{ fontSize: 12 }}>{a.audience === "all" ? "Everyone" : `${PLAN_LABEL[a.audience]} studios`} · {date(a.created_at)}{a.ends_at ? ` → ${date(a.ends_at)}` : ""}</small></div>
              <div className="row" style={{ flexWrap: "nowrap" }}>
                <Toggle on={a.active} label="Live" onChange={async (v) => { if (sample) return; await api.saveAnnouncement({ id: a.id, active: v }); load(); }} />
                <button type="button" className="icon-btn" aria-label="Delete" onClick={async () => { if (sample || !window.confirm("Delete this announcement?")) return; await api.deleteAnnouncement(a.id); load(); }}><Icon name="x" /></button>
              </div>
            </div>
          )) : <div className="empty"><b>No announcements yet</b><span>Your first one will show at the top of every studio's app.</span></div>}
        </section>
      </div>
    </>
  );
}

/* ---------------- Milestones ---------------- */
export function Milestones({ ctx }) {
  const { sample, replayCelebration } = ctx;
  const [ms, setMs] = useState([]);
  const { data: d } = useOverview(0, sample);
  useEffect(() => { api.milestones(sample).then(setMs).catch(() => setMs([])); }, [sample]);
  const groups = [["studios", "Studios on Jovita", d?.studios], ["paying", "Paying subscribers", d?.paying]];
  return (
    <>
      <div className="page-head"><div><p className="eyebrow">Milestones</p><h1 className="h-l" style={{ marginTop: 6 }}>Moments worth celebrating</h1><p className="sub">When Jovita reaches one of these, HQ celebrates with confetti the next time you open it.</p></div>
        <button type="button" className="a-btn a-btn-gold" onClick={() => replayCelebration({ goal: 1000, metric: "studios" })}><Icon name="trophy" />Preview the celebration</button></div>
      {groups.map(([metric, title, now]) => {
        const list = ms.filter((m) => m.metric === metric);
        const next = list.find((m) => !m.reached_at);
        return (
          <section key={metric} className="card">
            <div className="card-head"><div><h2 className="h-m">{title}</h2><p className="sub">{now != null ? `${n(now)} now` : ""}{next ? ` · next: ${n(next.goal)}` : ""}</p></div></div>
            <div className="mile-grid">
              {list.map((m) => (
                <button key={m.goal} type="button" className={`mg ${m.reached_at ? "done" : m === next ? "next" : ""}`} style={{ textAlign: "left", cursor: m.reached_at ? "pointer" : "default", font: "inherit", color: "inherit" }} onClick={() => m.reached_at && replayCelebration(m)}>
                  <b className="num">{n(m.goal)}</b><small>{m.reached_at ? `Reached ${date(m.reached_at)}` : m === next && now != null ? `${n(m.goal - now)} to go` : "Ahead"}</small>
                </button>
              ))}
            </div>
          </section>
        );
      })}
    </>
  );
}

/* ---------------- Settings ---------------- */
export function Settings({ ctx, session }) {
  const { sample } = ctx;
  const [admins, setAdmins] = useState([]);
  const [audit, setAudit] = useState([]);
  useEffect(() => { if (sample) { setAdmins([{ email: session.user.email, role: "owner", created_at: new Date().toISOString() }]); setAudit([]); return; } api.admins().then(setAdmins).catch(() => {}); api.audit().then(setAudit).catch(() => {}); }, [sample, session]);
  return (
    <>
      <div className="page-head"><div><p className="eyebrow">Settings</p><h1 className="h-l" style={{ marginTop: 6 }}>HQ settings</h1></div></div>
      <div className="grid g-2">
        <section className="card">
          <div className="card-head"><div><h2 className="h-m">Who can open HQ</h2><p className="sub">Just you for now. Team access with view-only roles is ready when you need it.</p></div></div>
          {admins.map((a) => <div key={a.email} className="switch" style={{ marginBottom: 8 }}><div className="st"><span className="lg">{initials(a.email)}</span><div><b>{a.email}</b><small>{a.role === "owner" ? "Owner · full access" : "View only"} · since {date(a.created_at)}</small></div></div><span className="pill p-good">You</span></div>)}
        </section>
        <section className="card">
          <div className="card-head"><div><h2 className="h-m">Privacy promise</h2></div></div>
          <ul style={{ margin: 0, paddingLeft: 18, color: "var(--muted)", display: "flex", flexDirection: "column", gap: 8 }}>
            <li>HQ shows account details and totals, never a studio's client photos, contracts or messages.</li>
            <li>Every change you make to a studio is written to the audit trail below.</li>
            <li>HQ is protected by the database itself: only accounts on the admin list can read any of this.</li>
          </ul>
        </section>
      </div>
      <section className="card table-card">
        <div className="card-head" style={{ padding: "20px 22px 0" }}><div><h2 className="h-m">Audit trail</h2><p className="sub">Changes made in HQ</p></div></div>
        {audit.length ? <div className="tscroll"><table className="t"><thead><tr><th>When</th><th>Action</th><th>Studio</th><th>Details</th></tr></thead>
          <tbody>{audit.map((a) => <tr key={a.id}><td>{ago(a.created_at)}</td><td>{a.action.replace(/_/g, " ")}</td><td className="sub">{String(a.studio_id || "").slice(0, 8)}</td><td className="sub">{Object.entries(a.meta || {}).map(([k, v]) => `${k}: ${v}`).join(", ")}</td></tr>)}</tbody></table></div>
          : <div className="empty"><b>No changes yet</b><span>Plan changes, suspensions and notes appear here.</span></div>}
      </section>
    </>
  );
}
