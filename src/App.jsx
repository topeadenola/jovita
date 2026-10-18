import { useEffect, useState } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { supabase } from "./supabase";
import { DataProvider, useData } from "./lib/data";
import Shell from "./components/Shell";
import Auth from "./pages/Auth";
import Portal from "./pages/Portal";
import Today from "./pages/Today";
import Inbox from "./pages/Inbox";
import Clients from "./pages/Clients";
import Projects from "./pages/Projects";
import Bookings from "./pages/Bookings";
import Calendar from "./pages/Calendar";
import Money from "./pages/Money";
import Galleries from "./pages/Galleries";
import Settings from "./pages/Settings";
import Accounting from "./pages/Accounting";
import { tx } from "./lib/i18n";
import { useLang } from "./components/Lang";
import Onboarding from "./pages/Onboarding";
import ClientGallery from "./pages/ClientGallery";
import { SpotlightList, SpotlightPost } from "./pages/Spotlight";
import { LeaveGuard } from "./lib/unsaved";
import { applyTheme, getSaved } from "./lib/theme";

function Studio() {
  const { loading, error, studio } = useData();
  const { lang, change } = useLang();
  // The studio's saved language wins over location, unless this browser picked one
  useEffect(() => { if (studio?.language && studio.language !== lang) change(studio.language, { persist: false, auto: true }); }, [studio?.language]); // eslint-disable-line react-hooks/exhaustive-deps
  // The studio's appearance follows you between devices
  useEffect(() => { if (studio?.theme && studio.theme !== getSaved()) applyTheme(studio.theme); }, [studio?.theme]);
  if (loading) return <div className="loading">{tx("Loading your studio…")}</div>;
  if (error) return <div className="loading"><p className="err">{error}</p></div>;
  if (studio.suspended) return <div className="loading"><div className="empty"><b style={{ color: "var(--ink)" }}>{tx("Your studio is paused")}</b><p>{tx("Please contact Jovita support to switch it back on. Your clients' links still work.")}</p><button className="btn btn-secondary" onClick={() => supabase.auth.signOut()}>{tx("Sign out")}</button></div></div>;
  if (!studio.onboarded) return <Onboarding />;
  return (
    <Shell>
      <Routes>
        <Route path="/" element={<Today />} />
        <Route path="/inbox" element={<Inbox />} />
        <Route path="/clients" element={<Clients />} />
        <Route path="/projects" element={<Projects />} />
        <Route path="/bookings" element={<Bookings />} />
        <Route path="/calendar" element={<Calendar />} />
        <Route path="/money" element={<Money />} />
        <Route path="/accounting" element={<Accounting />} />
        <Route path="/galleries" element={<Galleries />} />
        <Route path="/templates" element={<Navigate to="/settings?tab=templates" replace />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Shell>
  );
}

// The website lives at getjovita.com (public/landing). Website pages opened on the app address go there, signed in or not.
const onLive = () => /getjovita\.com$/.test(location.hostname);
export const siteUrl = (path = "/") => (onLive() ? "https://getjovita.com" + path : "/landing" + path + (path.endsWith("/") ? "index.html" : ""));
function ToSite() {
  const { pathname } = useLocation();
  useEffect(() => { window.location.replace(pathname.startsWith("/pricing") ? siteUrl("/") + "#pricing" : siteUrl(pathname.replace(/\/?$/, "/"))); }, [pathname]);
  return <div className="loading">{tx("Loading…")}</div>;
}

// Signed out: the home page is the Jovita landing page (public/landing), with Sign in and Start free
function SignedOut() {
  const { pathname } = useLocation();
  useEffect(() => { if (pathname === "/") window.location.replace(siteUrl("/")); if (pathname.startsWith("/admin")) window.location.replace("/admin/"); }, [pathname]);
  return pathname === "/" ? <div className="loading">{tx("Loading…")}</div> : <Navigate to="/login" replace />;
}

export default function App() {
  const [session, setSession] = useState(undefined);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  return (
    <>
    <LeaveGuard />
    <Routes>
      <Route path="/p/:token" element={<Portal />} />
      <Route path="/g/:token" element={<ClientGallery />} />
      {["/about", "/help", "/privacy", "/pricing"].map((p) => <Route key={p} path={p} element={<ToSite />} />)}
      <Route path="/spotlight" element={<SpotlightList />} />
      <Route path="/spotlight/:slug" element={<SpotlightPost />} />
      <Route path="/login" element={session ? <Navigate to="/" replace /> : <Auth initial="signin" />} />
      <Route path="/signup" element={session ? <Navigate to="/" replace /> : <Auth initial="signup" />} />
      <Route
        path="/*"
        element={
          session === undefined ? <div className="loading">{tx("Loading…")}</div>
          : !session ? <SignedOut />
          : <DataProvider session={session}><Studio /></DataProvider>
        }
      />
    </Routes>
    </>
  );
}
