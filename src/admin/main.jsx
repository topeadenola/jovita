import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactDOM from "react-dom/client";
import { supabase } from "../supabase";
import { api } from "./api";
import Icon from "./Icon";
import Celebrate, { SmileMark } from "./Celebrate";
import Overview from "./Overview";
import Spotlight from "./Spotlight";
import { Activity, Announcements, Milestones, Revenue, Settings, Studios } from "./pages";
import { ago } from "./util";
import "./admin.css";

const NAV = [["overview", "Overview", "home"], ["studios", "Studios", "users"], ["revenue", "Revenue", "wallet"], ["activity", "Activity", "pulse"], ["announcements", "Announcements", "mega"], ["spotlight", "Spotlight", "image"], ["milestones", "Milestones", "trophy"], ["settings", "Settings", "settings"]];
const store = { get: (k, d) => { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } }, set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private window */ } } };
const NOTE_ICON = { trial: "trophy", upgrade_request: "up", downgrade_request: "down", signup: "users", upgrade: "up", downgrade: "down", cancel: "down", payment_failed: "alert", milestone: "trophy" };

function Gate() {
  const [session, setSession] = useState(undefined);
  const [admin, setAdmin] = useState(null);
  useEffect(() => {
    if (window.__HQ_PREVIEW) { setSession({ user: { email: "tope.adenola@gmail.com" } }); setAdmin(true); return; }
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);
  useEffect(() => { if (session && !window.__HQ_PREVIEW) api.isAdmin().then(setAdmin).catch(() => setAdmin(false)); }, [session]);
  if (session === undefined || (session && admin === null)) return <div className="loading">Opening Jovita HQ…</div>;
  if (!session) return <Login />;
  if (!admin) return (
    <div className="loading"><div className="empty"><SmileMark size={56} /><b>This area is for the Jovita team</b><p className="sub">You're signed in as {session.user.email}, which isn't an admin account.</p>
      <div className="row"><a className="a-btn a-btn-ghost" href="/">Go to my studio</a><button className="a-btn a-btn-primary" onClick={() => supabase.auth.signOut()}>Sign in as someone else</button></div></div></div>
  );
  return <HQ session={session} />;
}

function Login() {
  const [f, setF] = useState({ email: "", password: "" });
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  return (
    <div className="gate">
      <div className="gate-art">
        <div className="hq-brand" style={{ padding: 0 }}><SmileMark size={34} eyes="#fff" /><b>jovita</b><span>HQ</span></div>
        <h1>Everything happening across Jovita, in one calm place.</h1>
        <p style={{ position: "relative", zIndex: 1, color: "#D9CCE6", margin: 0 }}>For the Jovita team only.</p>
      </div>
      <div className="gate-form">
        <form onSubmit={async (e) => { e.preventDefault(); setBusy(true); setErr(""); const { error } = await supabase.auth.signInWithPassword(f); if (error) { setErr(error.message); setBusy(false); } }}>
          <h2 className="h-l">Sign in to HQ</h2>
          <p className="sub">Use the same account you use for Jovita.</p>
          <div className="field"><label htmlFor="e">Email</label><input id="e" className="a-input" type="email" autoComplete="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} required /></div>
          <div className="field"><label htmlFor="p">Password</label><input id="p" className="a-input" type="password" autoComplete="current-password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} required /></div>
          {err && <p className="err">{err}</p>}
          <button className="a-btn a-btn-primary" disabled={busy} style={{ justifyContent: "center" }}>{busy ? "Signing in…" : "Sign in"}</button>
        </form>
      </div>
    </div>
  );
}

function Bell({ notes, setNotes, sample, onOpenStudio }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const unread = notes.filter((x) => !x.read);
  useEffect(() => {
    if (!open) return;
    const h = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    const k = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", h); document.addEventListener("keydown", k);
    return () => { document.removeEventListener("mousedown", h); document.removeEventListener("keydown", k); };
  }, [open]);
  const readAll = async () => { await api.markRead(unread.map((x) => x.id), sample); setNotes((l) => l.map((x) => ({ ...x, read: true }))); };
  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button type="button" className="icon-btn" aria-label={`Notifications, ${unread.length} unread`} aria-expanded={open} onClick={() => setOpen(!open)}>
        <Icon name="bell" />{unread.length > 0 && <span className="dot">{unread.length > 9 ? "9+" : unread.length}</span>}
      </button>
      {open && (
        <div className="pop" role="dialog" aria-label="Notifications">
          <div className="pop-head"><b>Notifications</b>{unread.length > 0 && <button type="button" onClick={readAll}>Mark all read</button>}</div>
          {notes.length ? notes.map((x) => (
            <div key={x.id} className={`note ${x.read ? "" : "unread"}`} onClick={() => { if (x.studio_id) { onOpenStudio(x.studio_id); setOpen(false); } }} style={{ cursor: x.studio_id ? "pointer" : "default" }}>
              <span className={`fi ${x.kind === "milestone" || x.kind === "upgrade" || x.kind === "trial" || x.kind === "upgrade_request" ? "gold" : x.kind === "payment_failed" || x.kind === "downgrade_request" || x.kind === "cancel" || x.kind === "downgrade" ? "bad" : x.kind === "signup" ? "good" : ""}`}><Icon name={NOTE_ICON[x.kind] || "bell"} /></span>
              <div><b>{x.title}</b><p>{x.body}</p><small>{ago(x.created_at)}</small></div>
            </div>
          )) : <div className="empty"><b>All quiet</b><span>New signups, upgrades and milestones show up here.</span></div>}
        </div>
      )}
    </div>
  );
}

function HQ({ session }) {
  const [page, setPage] = useState(() => (location.hash.slice(1) || "overview"));
  const [sample, setSample] = useState(() => store.get("jhq-sample", !!window.__HQ_PREVIEW));
  const [days, setDays] = useState(() => store.get("jhq-days", 30));
  const [notes, setNotes] = useState([]);
  const [celebrate, setCelebrate] = useState(null);
  const [openStudio, setOpenStudio] = useState(null);
  const [search, setSearch] = useState("");
  const name = (session.user.user_metadata?.first_name) || "Tope";

  useEffect(() => { store.set("jhq-sample", sample); }, [sample]);
  useEffect(() => { store.set("jhq-days", days); }, [days]);
  useEffect(() => { const h = () => setPage(location.hash.slice(1) || "overview"); addEventListener("hashchange", h); return () => removeEventListener("hashchange", h); }, []);
  const go = (p) => { location.hash = p; setPage(p); window.scrollTo(0, 0); };

  // Notifications, live
  const loadNotes = useCallback(() => api.notifications(sample).then(setNotes).catch(() => setNotes([])), [sample]);
  useEffect(() => { loadNotes(); }, [loadNotes]);
  useEffect(() => { if (sample || window.__HQ_PREVIEW) return; return api.listen((x) => setNotes((l) => [x, ...l])); }, [sample]);
  // Milestones that haven't been celebrated yet
  const checkMilestones = useCallback(async () => {
    try {
      const ms = await api.milestones(sample);
      const due = ms.filter((m) => m.reached_at && !m.celebrated).sort((a, b) => b.goal - a.goal)[0];
      if (due && !(sample && sessionStorage.getItem("jhq-cel-shown"))) setCelebrate(due);
    } catch { /* table missing before migration */ }
  }, [sample]);
  useEffect(() => { checkMilestones(); }, [checkMilestones, notes.length]);
  const closeCelebrate = useCallback(async () => {
    const m = celebrate; setCelebrate(null);
    if (sample) sessionStorage.setItem("jhq-cel-shown", "1");
    if (m) await api.celebrated(m, sample).catch(() => {});
  }, [celebrate, sample]);

  const unread = notes.filter((x) => !x.read).length;
  const ctx = { sample, setSample, days, setDays, name, go, openStudio, setOpenStudio, search, setSearch, replayCelebration: (m) => setCelebrate(m || { goal: 1000, metric: "studios" }) };
  return (
    <div className="hq">
      <aside className="hq-side">
        <div className="hq-brand"><SmileMark size={30} eyes="#fff" /><b>jovita</b><span>HQ</span></div>
        <nav className="hq-nav" aria-label="HQ">
          {NAV.map(([k, label, icon]) => (
            <button key={k} type="button" aria-current={page === k ? "page" : undefined} onClick={() => go(k)}><Icon name={icon} /><span className="lbl">{label}</span>{k === "overview" && unread > 0 && <span className="count">{unread}</span>}</button>
          ))}
        </nav>
        <div className="hq-side-foot">
          <div className="hq-me"><span className="av">{name[0]}</span><div><b>{name}</b><small>Founder · Owner</small></div></div>
          <a className="link" href="/" target="_blank" rel="noreferrer"><Icon name="external" />Open the studio app</a>
          <button type="button" className="link" onClick={() => supabase.auth.signOut()}><Icon name="logout" />Sign out</button>
        </div>
      </aside>
      <div className="hq-main">
        <header className="hq-top">
          <label className="hq-search"><Icon name="search" /><span className="sr">Search studios</span>
            <input placeholder="Search studios by name or email" value={search} onChange={(e) => { setSearch(e.target.value); if (page !== "studios") go("studios"); }} /></label>
          <span className="spacer" />
          <label className="row sample-lbl" style={{ gap: 8, fontSize: 13, fontWeight: 600, color: "var(--muted)" }}>
            Sample data<button type="button" role="switch" className="toggle" aria-checked={sample} aria-label="Show sample data" onClick={() => setSample(!sample)} />
          </label>
          <Bell notes={notes} setNotes={setNotes} sample={sample} onOpenStudio={(id) => { setOpenStudio(id); go("studios"); }} />
        </header>
        <main className="hq-body">
          {sample && <div className="sample-bar"><Icon name="eye" size={18} /><span>You're looking at sample data so you can judge the design. Nothing here is real or saved.</span><button className="a-btn a-btn-sm a-btn-ghost" onClick={() => setSample(false)}>Show real data</button></div>}
          {page === "overview" && <Overview ctx={ctx} />}
          {page === "studios" && <Studios ctx={ctx} />}
          {page === "revenue" && <Revenue ctx={ctx} />}
          {page === "activity" && <Activity ctx={ctx} />}
          {page === "announcements" && <Announcements ctx={ctx} />}
          {page === "spotlight" && <Spotlight />}
          {page === "milestones" && <Milestones ctx={ctx} />}
          {page === "settings" && <Settings ctx={ctx} session={session} />}
        </main>
      </div>
      {celebrate && <Celebrate goal={celebrate.goal} metric={celebrate.metric} onClose={closeCelebrate} />}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<React.StrictMode><Gate /></React.StrictMode>);
