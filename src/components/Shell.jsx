import { createContext, useContext, useEffect, useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { supabase } from "../supabase";
import { useData } from "../lib/data";
import { invState, langPatch } from "../lib/format";
import { useToast } from "./ui";
import Icon, { Mark } from "./Icon";
import { ClientForm, InvoiceForm, ProjectForm, SessionForm } from "./Forms";
import ProjectDrawer from "./ProjectDrawer";
import { tx } from "../lib/i18n";
import { LangSwitch } from "./Lang";
import AskJovita from "./AskJovita";
import StudioLogo from "./StudioLogo";
import InvoiceEditor from "./InvoiceEditor";
import GalleryEditor from "./GalleryEditor";
import PaidMoment from "./PaidMoment";
import Reminders from "./Reminders";
import { PlanBadge, UpgradeSheet } from "./Upgrade";
import { loadPlan, planFromStudio } from "../lib/plan";
import { AskIcon } from "./Jo";
import { applyTheme, resolve } from "../lib/theme";
import { mailLink } from "../lib/voice";

const UiCtx = createContext(null);
export const useUi = () => useContext(UiCtx);

const NAV = [
  ["/", "Today", "today"], ["/inbox", "Inbox", "inbox"], ["/clients", "Clients", "users"], ["/projects", "Projects", "folder"],
  ["/bookings", "Bookings", "calendar"], ["/money", "Money", "wallet"], ["/accounting", "Accounting", "chart"], ["/galleries", "Galleries", "image"],
  ["/settings", "Settings", "settings"],
];

export default function Shell({ children }) {
  const { studio, messages, invoices, clients, updateStudio } = useData();
  const toast = useToast();
  const [q, setQ] = useState("");
  const [menu, setMenu] = useState(false);
  const [modal, setModal] = useState(null); // {kind, pre}
  const [openProject, setOpenProject] = useState(null);
  const [ask, setAsk] = useState(false);
  const [plan, setPlan] = useState(() => planFromStudio(studio));
  const [upgrade, setUpgrade] = useState(false);
  useEffect(() => { loadPlan(studio).then(setPlan); }, [studio.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const [openInvoice, setOpenInvoice] = useState(null);
  const [openGallery, setOpenGallery] = useState(null);
  const [mode, setMode] = useState(() => document.documentElement.dataset.theme || resolve(studio.theme || "auto"));
  useEffect(() => {
    const h = (e) => setMode(e.detail.theme);
    window.addEventListener("jovita:theme", h);
    return () => window.removeEventListener("jovita:theme", h);
  }, []);
  const flipMode = () => {
    const next = mode === "dark" ? "light" : "dark";
    applyTheme(next);
    updateStudio({ theme: next }).catch(() => {});
  };
  const thanks = (p) => {
    const c = clients.find((x) => x.id === p.clientId);
    if (!c) return;
    const text = tx("Hi {name}! Payment received, thank you so much. It was a joy working with you.", { name: c.name.split(" ")[0] }) + (studio.owner_first_name ? "\n" + String(studio.owner_first_name).split(" ")[0] : "");
    const url = mailLink(c.email, tx("Thank you!"), text);
    if (url) window.open(url, "_blank", "noopener");
  };
  // Announcements from Jovita HQ (dismissed ones stay hidden on this device)
  const [news, setNews] = useState([]);
  useEffect(() => {
    let hidden = []; try { hidden = JSON.parse(localStorage.getItem("jovita-news-hidden") || "[]"); } catch { /* private window */ }
    supabase.from("announcements").select("id,title,body,level,link,audience").then(({ data }) => setNews((data || []).filter((a) => !hidden.includes(a.id) && (a.audience === "all" || a.audience === (studio.plan || "free")))));
  }, [studio.plan]);
  const hideNews = (id) => { setNews((l) => l.filter((a) => a.id !== id)); try { const h = JSON.parse(localStorage.getItem("jovita-news-hidden") || "[]"); localStorage.setItem("jovita-news-hidden", JSON.stringify([...h, id])); } catch { /* ignore */ } };
  const loc = useLocation();
  const nav = useNavigate();

  useEffect(() => { setMenu(false); }, [loc.pathname]);
  useEffect(() => {
    if (!menu) return;
    const h = (e) => { if (!e.target.closest(".newwrap")) setMenu(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [menu]);

  const unread = messages.filter((m) => m.from_client && !m.read).length;
  const overdue = invoices.filter((i) => invState(i).k === "Overdue").length;
  const open = (kind, pre) => { setMenu(false); setModal({ kind, pre }); };
  const onSearch = (v) => {
    setQ(v);
    if (v && !["/clients", "/projects", "/money", "/galleries"].includes(loc.pathname)) nav("/projects");
  };

  return (
    <UiCtx.Provider value={{ q, setQ, open, openProject, setOpenProject, openAsk: () => setAsk(true), setOpenInvoice, setOpenGallery, plan, setPlan, openUpgrade: () => setUpgrade(true) }}>
      <div className="app">
        <aside className="side">
          <div className="brand"><Mark dot="#261433" /><b>{tx("jovita")}</b></div>
          <p className="studio">{studio.name}</p>
          <PlanBadge plan={plan} onOpen={() => setUpgrade(true)} />
          <nav className="nav" aria-label={tx("Main")}>
            {NAV.map(([to, label, icon]) => (
              <NavLink key={to} to={to} end={to === "/"} className={({ isActive }) => (isActive ? "active" : "")}>
                <Icon name={icon} /><span>{tx(label)}</span>
                {to === "/inbox" && unread > 0 && <span className="badge">{unread}</span>}
                {to === "/money" && overdue > 0 && <span className="badge">{overdue}</span>}
              </NavLink>
            ))}
          </nav>
          <div className="side-foot">
            <div className="me-card">
              <StudioLogo studio={studio} className="av" />
              <div><b>{studio.owner_first_name || studio.name}</b><span>{studio.name}</span></div>
            </div>
            <a className="side-link" href="/spotlight" target="_blank" rel="noreferrer"><Icon name="star" />{tx("Spotlight")}</a>
            <LangSwitch onPick={(l) => { const p = langPatch(studio, l); updateStudio(p).then(() => p.home_currency && setTimeout(() => toast(tx("Prices now show in {cur}. You can change this in Settings.", { cur: p.home_currency })), 60)).catch(() => {}); }} />
            <button type="button" onClick={() => supabase.auth.signOut()}><Icon name="logout" />{tx("Sign out")}</button>
          </div>
        </aside>
        <main className="main">
          <div className="topbar">
            <label className="search" htmlFor="gsearch"><Icon name="search" />
              <input id="gsearch" placeholder={tx("Search clients, projects, invoices")} value={q} onChange={(e) => onSearch(e.target.value)} autoComplete="off" />
            </label>
            <span className="spacer" />
            <button type="button" className="mode-btn" onClick={flipMode} aria-label={tx("Switch bright or dark mode")}>
              <Icon name={mode === "dark" ? "moon" : "today"} />{mode === "dark" ? tx("Dark") : tx("Bright")}
            </button>
            <div className="newwrap">
              <button type="button" className="btn btn-joy" aria-expanded={menu} onClick={() => setMenu(!menu)}><Icon name="plus" />{tx("New")}</button>
              {menu && (
                <div className="menu" role="menu">
                  <button type="button" onClick={() => open("project")}><Icon name="folder" />{tx("Project")}</button>
                  <button type="button" onClick={() => open("client")}><Icon name="users" />{tx("Client")}</button>
                  <button type="button" onClick={() => open("invoice")}><Icon name="receipt" />{tx("Invoice")}</button>
                  <button type="button" onClick={() => open("quote")}><Icon name="file" />{tx("Quote")}</button>
                  <button type="button" onClick={() => open("session")}><Icon name="calendar" />{tx("Session type")}</button>
                  <button type="button" onClick={() => { setMenu(false); nav("/accounting"); }}><Icon name="chart" />{tx("Expense")}</button>
                  <button type="button" onClick={() => { setMenu(false); nav("/settings?tab=templates"); }}><Icon name="file" />{tx("Template")}</button>
                </div>
              )}
            </div>
          </div>
          {news.map((a) => (
            <div key={a.id} className={`news news-${a.level}`} role="status">
              <Mark dot="#261433" style={{ width: 14, height: 20, flex: "none" }} />
              <div style={{ flex: 1, minWidth: 0 }}><b>{a.title}</b>{a.body && <span> · {a.body}</span>}{a.link && <> · <a href={a.link} target="_blank" rel="noreferrer">{tx("Learn more")}</a></>}</div>
              <button type="button" className="x" onClick={() => hideNews(a.id)} aria-label={tx("Dismiss")}><Icon name="x" /></button>
            </div>
          ))}
          {children}
        </main>
      </div>
      {modal?.kind === "client" && <ClientForm onClose={() => setModal(null)} />}
      {modal?.kind === "project" && <ProjectForm pre={modal.pre} onClose={() => setModal(null)} onCreated={(p) => { setModal(null); nav("/projects"); setOpenProject(p.id); }} />}
      {(modal?.kind === "invoice" || modal?.kind === "quote") && <InvoiceForm pre={modal.pre} kind={modal.kind} onClose={() => setModal(null)} onCreated={(iid) => { setModal(null); setOpenInvoice(iid); }} />}
      {openInvoice && <InvoiceEditor key={openInvoice} id={openInvoice} onClose={() => setOpenInvoice(null)} />}
      {openGallery && <GalleryEditor key={openGallery} id={openGallery} onClose={() => setOpenGallery(null)} />}
      {modal?.kind === "session" && <SessionForm onClose={() => setModal(null)} />}
      {!ask && (
        <button type="button" className="ask-pill" onClick={() => setAsk(true)}><AskIcon state="typing" />{tx("Ask Jovita")}</button>
      )}
      {ask && <AskJovita onClose={() => setAsk(false)} />}
      <Reminders />
      {upgrade && <UpgradeSheet plan={plan} onPlan={setPlan} onClose={() => setUpgrade(false)} />}
      <PaidMoment onThanks={thanks} />
      {openProject && !modal && <ProjectDrawer id={openProject} onClose={() => setOpenProject(null)} onNewInvoice={(pid) => setModal({ kind: "invoice", pre: pid })} />}
    </UiCtx.Provider>
  );
}
