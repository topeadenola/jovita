import { useEffect, useMemo, useState } from "react";
import { api } from "./api";
import Icon from "./Icon";
import { SmileMark } from "./Celebrate";
import { AreaChart, Bars, BarList, Donut, Funnel, Sparkline } from "./charts";
import { COUNTRY, EVENT, ago, byValue, delta, eventText, greeting, money, n } from "./util";

export const RANGES = [[7, "7 days"], [30, "30 days"], [90, "90 days"], [365, "12 months"], [0, "All time"]];

export function useOverview(days, sample) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let live = true; setLoading(true);
    api.overview(days, sample).then((d) => { if (live) { setData(d); setErr(""); } }).catch((e) => live && setErr(e.message)).finally(() => live && setLoading(false));
    return () => { live = false; };
  }, [days, sample]);
  return { data, err, loading };
}

function Kpi({ label, value, foot, d, spark, extra, hero, icon }) {
  return (
    <div className={`card kpi ${hero ? "hero" : ""}`}>
      <span className="kpi-label">{icon && <Icon name={icon} size={15} />}{label}</span>
      <span className="kpi-value">{value}</span>
      {extra?.length > 0 && <div className="kpi-extra">{extra.map((x) => <span key={x}>{x}</span>)}</div>}
      <div className="kpi-foot">{d && <span className={`delta ${d.cls}`}>{d.text}</span>}<span>{foot}</span></div>
      {spark && <Sparkline data={spark} />}
    </div>
  );
}

export function RangePicker({ days, setDays }) {
  return <div className="seg" role="group" aria-label="Date range">{RANGES.map(([k, l]) => <button key={k} type="button" aria-pressed={days === k} onClick={() => setDays(k)}>{l}</button>)}</div>;
}

// Estimated US$ per million tokens (input, output). Check Anthropic's pricing page and adjust.
const RATES = { haiku: [0.1, 0.5], sonnet: [2, 10], opus: [4, 20] };
const rate = (model) => RATES[Object.keys(RATES).find((k) => model.includes(k))] || RATES.sonnet;
const PLAN_COLOR = { free: "var(--free)", pro: "var(--pro)", studio: "var(--studio)" };

function Brain({ days, sample, rangeText, onOpenStudio }) {
  const [u, setU] = useState(null);
  const [err, setErr] = useState(false);
  useEffect(() => { let live = true; setErr(false); api.aiUsage(days, sample).then((d) => live && setU(d)).catch(() => live && setErr(true)); return () => { live = false; }; }, [days, sample]);
  if (err) return (
    <section className="card"><div className="card-head"><div><h2 className="h-m">Ask Jovita</h2><p className="sub">Usage shows here after you run the brain update in Supabase.</p></div></div></section>
  );
  if (!u) return null;
  const cost = Object.entries(u.by_model || {}).reduce((s, [m, x]) => { const [i, o] = rate(m); return s + (x.in * i + x.out * o) / 1e6; }, 0);
  const rows = (u.daily || []).map((r) => ({ d: r.day, q: r.questions }));
  const perQ = u.questions ? cost / u.questions : 0;
  return (
    <section className="card">
      <div className="card-head">
        <div><h2 className="h-m">Ask Jovita</h2><p className="sub">The assistant inside every studio · last {rangeText} · counts only, never what anyone asked</p></div>
      </div>
      <div className="stat-grid" style={{ gridTemplateColumns: "repeat(4, 1fr)", marginBottom: 20 }}>
        <div><small>Questions asked</small><b className="num">{n(u.questions)}</b></div>
        <div><small>Studios using it</small><b className="num">{n(u.studios)}</b></div>
        <div><small>Actions suggested</small><b className="num">{n(u.actions)}</b></div>
        <div><small>Estimated AI cost</small><b className="num">{"$" + (cost < 100 ? cost.toFixed(2) : n(cost))}</b><small>{u.questions ? `about $${perQ.toFixed(4)} a question` : "nothing yet"}</small></div>
      </div>
      <div className="grid g-2-1" style={{ gap: 24 }}>
        <div>{rows.length > 1 ? <Bars rows={rows} field="q" label="Questions" height={220} /> : <div className="empty">Questions per day appear here once studios start asking.</div>}</div>
        <div>
          <p className="eyebrow" style={{ marginBottom: 10 }}>Most active studios</p>
          {u.top?.length ? <BarList rows={u.top.map((t) => ({ k: t.studio_id, n: t.questions }))} labels={Object.fromEntries(u.top.map((t) => [t.studio_id, t.name]))} /> : <p className="sub">No one yet.</p>}
          <p className="eyebrow" style={{ margin: "18px 0 10px" }}>By plan</p>
          <div className="row" style={{ gap: 14, flexWrap: "wrap" }}>{["free", "pro", "studio"].map((k) => <span key={k} className="row" style={{ gap: 6, fontSize: 13 }}><i style={{ width: 10, height: 10, borderRadius: 3, background: PLAN_COLOR[k], display: "inline-block" }} />{k[0].toUpperCase() + k.slice(1)} <b className="num">{n(u.by_plan?.[k] || 0)}</b></span>)}</div>
        </div>
      </div>
    </section>
  );
}

export default function Overview({ ctx }) {
  const { days, setDays, sample, name, go, setOpenStudio } = ctx;
  const { data: d, err, loading } = useOverview(days, sample);
  const [metric, setMetric] = useState("signups");
  const rangeText = RANGES.find((r) => r[0] === days)?.[1].toLowerCase();

  const spark = useMemo(() => (d?.daily || []).map((r) => r.signups), [d]);
  const cumulative = useMemo(() => { let c = d ? d.studios - (d.daily || []).reduce((s, r) => s + r.signups, 0) : 0; return (d?.daily || []).map((r) => (c += r.signups)); }, [d]);
  if (err) return <div className="card empty"><b>HQ needs one setup step</b><p className="sub">Run the latest Jovita update in Supabase (RUN-THIS-IN-SUPABASE.sql), then refresh. Or turn on Sample data to preview the dashboard.</p><small className="sub">{err}</small></div>;
  if (!d) return <div className="loading" style={{ minHeight: 300 }}>Loading the numbers…</div>;

  const mrr = byValue(d.mrr); const processed = byValue(d.processed); const prevProcessed = d.processed_prev || {};
  const goal = d.next_milestone?.goal; const pct = goal ? Math.min(100, (d.studios / goal) * 100) : 100;
  const conv = d.studios ? Math.round((d.paying / d.studios) * 100) : 0;
  const plans = [
    { key: "free", label: "Free", value: d.plans?.free || 0, color: "var(--free)" },
    { key: "pro", label: "Pro", value: d.plans?.pro || 0, color: "var(--pro)" },
    { key: "studio", label: "Studio", value: d.plans?.studio || 0, color: "var(--studio)" },
  ];
  const attention = [
    d.suspended ? ["bad", d.suspended, "suspended studios", "studios"] : null,
    d.studios - d.onboarded > 0 ? ["warn", d.studios - d.onboarded, "studios haven't finished setup", "studios"] : null,
    ["good", d.active7, "studios were active in the last 7 days", "studios"],
  ].filter(Boolean);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24, opacity: loading ? 0.6 : 1, transition: "opacity .2s" }}>
      <div className="page-head">
        <div>
          <p className="eyebrow">{new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}</p>
          <h1 className="h-xl" style={{ marginTop: 6 }}>{greeting()}, {name}</h1>
          <p className="sub">{d.signups ? `${n(d.signups)} new studios in the last ${rangeText}. ` : ""}Here's how Jovita is doing.</p>
        </div>
        <RangePicker days={days} setDays={setDays} />
      </div>

      {goal && (
        <div className="mile">
          <span className="mile-mark"><SmileMark size={38} /></span>
          <div className="mile-body">
            <div className="mile-top"><b>{n(d.studios)} of {n(goal)} studios</b><span>{n(goal - d.studios)} to go until the next celebration</span></div>
            <div className="mile-track" role="progressbar" aria-valuemin={0} aria-valuemax={goal} aria-valuenow={d.studios} aria-label="Progress to next milestone"><div className="mile-bar" style={{ width: `${pct}%` }} /></div>
          </div>
          <button type="button" className="a-btn a-btn-sm a-btn-gold" style={{ position: "relative", zIndex: 1 }} onClick={() => go("milestones")}>Milestones</button>
        </div>
      )}

      <div className="grid g-kpi">
        <Kpi icon="users" label="Total studios" value={n(d.studios)} d={delta(d.studios, d.studios_prev)} foot={`vs ${rangeText} ago`} spark={cumulative} />
        <Kpi icon="plus" label="New signups" value={n(d.signups)} d={delta(d.signups, d.signups_prev)} foot={`last ${rangeText}`} spark={spark} />
        <Kpi icon="pulse" label="Active studios" value={n(d.active)} foot={`signed in this month · ${d.studios ? Math.round((d.active / d.studios) * 100) : 0}% of all`} />
        <Kpi icon="trophy" label="Paying subscribers" value={n(d.paying)} d={delta(d.paying, d.paying_prev)} foot={`${conv}% of studios pay`} />
        <Kpi hero icon="wallet" label="Monthly revenue (estimated)" value={mrr.length ? money(mrr[0][1], mrr[0][0]) : money(0)} extra={mrr.slice(1).map(([c, v]) => money(v, c))}
          foot={Object.keys(d.billing || {}).length ? `${money(byValue(d.billing)[0][1], byValue(d.billing)[0][0])} collected` : "From plan prices · billing connects later"} />
        <Kpi icon="globe" label="Money through Jovita" value={processed.length ? money(processed[0][1], processed[0][0]) : money(0)} extra={processed.slice(1, 4).map(([c, v]) => money(v, c))}
          d={processed.length ? delta(processed[0][1], prevProcessed[processed[0][0]]) : null} foot="paid to studios by their clients" />
      </div>

      <div className="grid g-2-1">
        <section className="card">
          <div className="card-head">
            <div><h2 className="h-m">{metric === "signups" ? "New studios" : "Active studios"}</h2><p className="sub">{metric === "signups" ? "Signups per day" : "Studios that did something each day"} · last {rangeText}</p></div>
            <div className="seg" role="group" aria-label="Chart"><button type="button" aria-pressed={metric === "signups"} onClick={() => setMetric("signups")}>Signups</button><button type="button" aria-pressed={metric === "active"} onClick={() => setMetric("active")}>Active</button></div>
          </div>
          {d.daily?.length > 1 ? <AreaChart rows={d.daily} field={metric} label={metric === "signups" ? "New studios" : "Active studios"} height={340} /> : <div className="empty">Not enough days yet to draw a trend.</div>}
        </section>
        <section className="card">
          <div className="card-head"><div><h2 className="h-m">Plans</h2><p className="sub">Every studio by plan, right now</p></div></div>
          <Donut parts={plans} center={{ value: n(d.studios), label: "studios" }} />
        </section>
      </div>

      <div className="grid g-2">
        <section className="card">
          <div className="card-head"><div><h2 className="h-m">From signup to paying</h2><p className="sub">Studios that joined in the last {rangeText}</p></div></div>
          <Funnel steps={[["Signed up"], ["Finished setup"], ["Added a client"], ["Sent an invoice"], ["Got paid"], ["Upgraded"]].map(([label], i) => ({ label, value: d.funnel?.[i] || 0 }))} />
        </section>
        <section className="card">
          <div className="card-head"><div><h2 className="h-m">Upgrades</h2><p className="sub">Studios moving to Pro or Studio · last {rangeText}</p></div><b className="num" style={{ font: "700 22px var(--display)" }}>{n((d.daily || []).reduce((s, r) => s + (r.upgrades || 0), 0))}</b></div>
          {d.daily?.length > 1 ? <Bars rows={d.daily} field="upgrades" label="Upgrades" height={360} /> : <div className="empty">No upgrades yet.</div>}
          <div className="grid g-3 push" style={{ paddingTop: 18, gap: 10 }}>
            <div className="stat-grid" style={{ gridTemplateColumns: "1fr", gap: 0 }}><div><small>Invoices sent</small><b className="num">{n(d.invoices_sent)}</b></div></div>
            <div className="stat-grid" style={{ gridTemplateColumns: "1fr", gap: 0 }}><div><small>Clients managed</small><b className="num">{n(d.clients)}</b></div></div>
            <div className="stat-grid" style={{ gridTemplateColumns: "1fr", gap: 0 }}><div><small>Galleries</small><b className="num">{n(d.galleries)}</b></div></div>
          </div>
        </section>
      </div>

      <Brain days={days} sample={sample} rangeText={rangeText} />

      <div className="grid g-3">
        <section className="card">
          <div className="card-head"><h2 className="h-m">Where studios are</h2></div>
          {d.countries?.length ? <BarList rows={d.countries} labels={COUNTRY} /> : <div className="empty">No studios yet.</div>}
        </section>
        <section className="card">
          <div className="card-head"><h2 className="h-m">What they do</h2></div>
          {d.careers?.length ? <BarList rows={d.careers} /> : <div className="empty">Careers appear after onboarding.</div>}
        </section>
        <section className="card">
          <div className="card-head"><h2 className="h-m">Needs a look</h2></div>
          <div className="attention">
            {attention.map(([cls, v, text, to]) => <button key={text} type="button" className={`att ${cls}`} style={{ border: 0, textAlign: "left", cursor: "pointer" }} onClick={() => go(to)}><b className="num">{n(v)}</b><span>{text}</span><Icon name="arrow" size={16} /></button>)}
          </div>
        </section>
      </div>

      <section className="card">
        <div className="card-head"><div><h2 className="h-m">Latest across Jovita</h2><p className="sub">Live activity from every studio</p></div><button type="button" className="a-btn a-btn-sm a-btn-ghost" onClick={() => go("activity")}>See all<Icon name="arrow" /></button></div>
        <ul className="feed">
          {(d.recent || []).map((e, i) => {
            const [label, icon, cls] = EVENT[e.kind] || [e.kind, "pulse", ""];
            return (
              <li key={i} onClick={() => { if (e.studio_id) { setOpenStudio(e.studio_id); go("studios"); } }} style={{ cursor: e.studio_id ? "pointer" : "default" }}>
                <span className={`fi ${cls}`}><Icon name={icon} /></span>
                <p><b>{e.studio || "A studio"}</b> · {label}{eventText(e) && <span className="sub"> · {eventText(e)}</span>}</p>
                <small>{ago(e.at)}</small>
              </li>
            );
          })}
          {!d.recent?.length && <li><span /><p className="sub">Activity shows here as studios use Jovita.</p><span /></li>}
        </ul>
      </section>
    </div>
  );
}
