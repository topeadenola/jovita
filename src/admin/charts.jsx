import { useMemo, useRef, useState } from "react";

const fmtN = (n) => new Intl.NumberFormat("en-GB").format(Math.round(n || 0));
const fmtDay = (d) => new Date(d + "T12:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" });

// Rounded "nice" axis maximum
function niceMax(v) { if (v <= 0) return 4; const p = Math.pow(10, Math.floor(Math.log10(v))); const m = v / p; return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p; }

/* Tiny trend line for stat tiles */
export function Sparkline({ data, w = 120, h = 36 }) {
  if (!data?.length) return null;
  const max = Math.max(...data, 1), min = Math.min(...data, 0);
  const pts = data.map((v, i) => [(i / Math.max(1, data.length - 1)) * w, h - 3 - ((v - min) / (max - min || 1)) * (h - 6)]);
  const d = pts.map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" ");
  return (
    <svg className="spark" viewBox={`0 0 ${w} ${h}`} width={w} height={h} aria-hidden="true">
      <path d={`${d} L${w} ${h} L0 ${h} Z`} className="spark-fill" />
      <path d={d} className="spark-line" />
      <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r="3" className="spark-dot" />
    </svg>
  );
}

/* One series over time, with a crosshair that snaps to the nearest day */
export function AreaChart({ rows, field, label, height = 260 }) {
  const box = useRef(null);
  const [hover, setHover] = useState(null);
  const W = 760, H = height, L = 40, R = 12, T = 14, B = 28;
  const vals = rows.map((r) => r[field] || 0);
  const max = niceMax(Math.max(...vals, 1));
  const x = (i) => L + (i / Math.max(1, rows.length - 1)) * (W - L - R);
  const y = (v) => T + (1 - v / max) * (H - T - B);
  const line = vals.map((v, i) => (i ? "L" : "M") + x(i).toFixed(1) + " " + y(v).toFixed(1)).join(" ");
  const div = [4, 5, 3].find((k) => Number.isInteger(max / k)) || 4;
  const ticks = Array.from({ length: div + 1 }, (_, i) => (i / div) * max);
  const step = Math.max(1, Math.ceil(rows.length / 6));
  const onMove = (e) => {
    const rect = box.current.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    const i = Math.max(0, Math.min(rows.length - 1, Math.round(((px - L) / (W - L - R)) * (rows.length - 1))));
    setHover(i);
  };
  const hv = hover != null ? rows[hover] : null;
  return (
    <div className="chart-wrap">
      <svg ref={box} viewBox={`0 0 ${W} ${H}`} className="area-chart" role="img" aria-label={`${label} over time`}
        onPointerMove={onMove} onPointerLeave={() => setHover(null)}>
        <defs>
          <linearGradient id={`g-${field}`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="var(--series)" stopOpacity="0.22" />
            <stop offset="1" stopColor="var(--series)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} className="grid" />
            <text x={L - 8} y={y(t) + 4} className="axis" textAnchor="end">{fmtN(t)}</text>
          </g>
        ))}
        {rows.map((r, i) => (i % step === 0 || i === rows.length - 1) && <text key={r.d} x={x(i)} y={H - 8} className="axis" textAnchor={i === 0 ? "start" : i === rows.length - 1 ? "end" : "middle"}>{fmtDay(r.d)}</text>)}
        <path d={`${line} L${x(rows.length - 1)} ${y(0)} L${x(0)} ${y(0)} Z`} fill={`url(#g-${field})`} />
        <path d={line} className="series-line" />
        {hv && (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={T} y2={H - B} className="crosshair" />
            <circle cx={x(hover)} cy={y(vals[hover])} r="5" className="series-dot" />
          </g>
        )}
      </svg>
      {hv && (
        <div className="tip" style={{ left: `${(x(hover) / W) * 100}%` }} role="status">
          <b>{fmtN(hv[field])}</b><span><i className="tip-key" />{label}</span><small>{fmtDay(hv.d)}</small>
        </div>
      )}
    </div>
  );
}

/* Plan mix: donut with a legend that carries every value */
export function Donut({ parts, size = 196, center }) {
  const [hover, setHover] = useState(null);
  const total = parts.reduce((s, p) => s + p.value, 0) || 1;
  const R = size / 2, r = R - 22, C = 2 * Math.PI * r;
  let acc = 0;
  const gap = parts.filter((p) => p.value).length > 1 ? 3 : 0;
  return (
    <div className="donut-wrap">
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} className="donut" role="img" aria-label={parts.map((p) => `${p.label} ${p.value}`).join(", ")}>
        <circle cx={R} cy={R} r={r} className="donut-track" />
        {parts.map((p, i) => {
          const len = (p.value / total) * C; const dash = Math.max(0, len - gap);
          const el = <circle key={p.key} cx={R} cy={R} r={r} fill="none" stroke={p.color} strokeWidth={hover === i ? 26 : 22}
            strokeDasharray={`${dash} ${C - dash}`} strokeDashoffset={-acc} transform={`rotate(-90 ${R} ${R})`}
            onPointerEnter={() => setHover(i)} onPointerLeave={() => setHover(null)} style={{ transition: "stroke-width .15s" }} />;
          acc += len; return el;
        })}
        <text x={R} y={R - 4} textAnchor="middle" className="donut-n">{hover != null ? fmtN(parts[hover].value) : center?.value}</text>
        <text x={R} y={R + 16} textAnchor="middle" className="donut-l">{hover != null ? parts[hover].label : center?.label}</text>
      </svg>
      <ul className="legend">
        {parts.map((p, i) => (
          <li key={p.key} onPointerEnter={() => setHover(i)} onPointerLeave={() => setHover(null)} data-on={hover === i || undefined}>
            <i style={{ background: p.color }} /><span>{p.label}</span><b className="num">{fmtN(p.value)}</b><small>{Math.round((p.value / total) * 100)}%</small>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* Ranked list with inline bars (countries, careers) */
export function BarList({ rows, labels = {}, max, format }) {
  const top = max ?? Math.max(...rows.map((r) => r.n), 1);
  return (
    <ul className="barlist">
      {rows.map((r) => (
        <li key={r.k} title={`${labels[r.k] || r.k}: ${fmtN(r.n)}`}>
          <span className="bl-label">{labels[r.k] || r.k}</span>
          <span className="bl-track"><span className="bl-bar" style={{ width: `${Math.max(2, (r.n / top) * 100)}%` }} /></span>
          <b className="num">{format ? format(r) : fmtN(r.n)}</b>
        </li>
      ))}
    </ul>
  );
}

/* Signup to paid: each step's share of the first */
export function Funnel({ steps }) {
  const first = steps[0]?.value || 1;
  return (
    <ol className="funnel">
      {steps.map((s, i) => {
        const pct = Math.round((s.value / first) * 100);
        const fromPrev = i ? Math.round((s.value / (steps[i - 1].value || 1)) * 100) : null;
        return (
          <li key={s.label}>
            <div className="fn-top"><span>{s.label}</span><b className="num">{fmtN(s.value)}</b></div>
            <div className="fn-track"><div className="fn-bar" style={{ width: `${Math.max(2, pct)}%` }} /></div>
            <small>{i ? `${fromPrev}% of previous step · ${pct}% of signups` : "Everyone who signed up"}</small>
          </li>
        );
      })}
    </ol>
  );
}

/* Vertical bars, one per day/week, for upgrades */
export function Bars({ rows, field, label, height = 160 }) {
  const [hover, setHover] = useState(null);
  const grouped = useMemo(() => {
    if (rows.length <= 31) return rows.map((r) => ({ d: r.d, v: r[field] || 0 }));
    const out = []; for (let i = 0; i < rows.length; i += 7) { const g = rows.slice(i, i + 7); out.push({ d: g[0].d, v: g.reduce((s, r) => s + (r[field] || 0), 0) }); } return out;
  }, [rows, field]);
  const W = 760, H = height, T = 10, B = 24;
  const max = niceMax(Math.max(...grouped.map((g) => g.v), 1));
  const bw = (W / grouped.length);
  return (
    <div className="chart-wrap">
      <svg viewBox={`0 0 ${W} ${H}`} className="bars" preserveAspectRatio="none" style={{ height }} role="img" aria-label={`${label} by ${rows.length > 31 ? "week" : "day"}`}>
        <line x1="0" x2={W} y1={H - B} y2={H - B} className="grid" />
        {grouped.map((g, i) => {
          const h = (g.v / max) * (H - T - B);
          return (
            <g key={g.d} onPointerEnter={() => setHover(i)} onPointerLeave={() => setHover(null)}>
              <rect x={i * bw} y={T} width={bw} height={H - T - B} fill="transparent" />
              <path className={`bar ${hover === i ? "on" : ""}`} d={roundTop(i * bw + 1, H - B - h, Math.max(2, bw - 2), h, Math.min(4, (bw - 2) / 2))} />
            </g>
          );
        })}
      </svg>
      {hover != null && <div className="tip" style={{ left: `${((hover + 0.5) * bw / W) * 100}%` }}><b>{fmtN(grouped[hover].v)}</b><span><i className="tip-key" />{label}</span><small>{rows.length > 31 ? "Week of " : ""}{fmtDay(grouped[hover].d)}</small></div>}
    </div>
  );
}
function roundTop(x, y, w, h, r) {
  if (h <= 0) return "";
  r = Math.min(r, h);
  return `M${x} ${y + h} V${y + r} Q${x} ${y} ${x + r} ${y} H${x + w - r} Q${x + w} ${y} ${x + w} ${y + r} V${y + h} Z`;
}
