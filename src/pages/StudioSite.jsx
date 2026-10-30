// What clients see on a studio's own address (horploadworks.getjovita.com or gallery.horploadworks.com):
// only that studio's galleries and client pages, in their name. No Jovita app, sign-in or menus here.
import { useEffect, useState } from "react";
import { Route, Routes, useParams } from "react-router-dom";
import { supabase } from "../supabase";
import { tx } from "../lib/i18n";
import { hostName } from "../lib/links";
import { logoUrl } from "../components/StudioLogo";
import { Mark } from "../components/Icon";
import ClientGallery from "./ClientGallery";
import Portal from "./Portal";
import InvoiceView from "./InvoiceView";

function useSite() {
  const [site, setSite] = useState(undefined);
  useEffect(() => {
    supabase.rpc("site_info", { p_host: hostName() }).then(({ data }) => setSite(data || null), () => setSite(null));
  }, []);
  return site;
}

function Card({ site, title, text }) {
  return (
    <main className="site-card-wrap">
      <div className="site-card">
        {site?.logo_path ? <img src={logoUrl(site.logo_path)} alt="" className="site-logo" /> : null}
        {site?.name && <p className="eyebrow">{site.name}</p>}
        <h1 className="h-l">{title}</h1>
        {text && <p className="sub">{text}</p>}
      </div>
      {site && !site.branded && <a className="site-made" href="https://getjovita.com" target="_blank" rel="noreferrer"><Mark dot="#261433" style={{ width: 10, height: 14 }} />{tx("Made with Jovita")}</a>}
    </main>
  );
}

// /segun-40th → that studio's published gallery with this name
function NamedGallery() {
  const { slug } = useParams();
  const site = useSite();
  const [token, setToken] = useState(undefined);
  useEffect(() => {
    supabase.rpc("site_gallery", { p_host: hostName(), p_slug: slug }).then(({ data }) => setToken(data || null), () => setToken(null));
  }, [slug]);
  if (token === undefined) return <div className="loading">{tx("Loading…")}</div>;
  if (!token) return <Card site={site} title={tx("This gallery isn't available")} text={tx("Check the link with your photographer.")} />;
  return <ClientGallery token={token} />;
}

function Home() {
  const site = useSite();
  if (site === undefined) return <div className="loading">{tx("Loading…")}</div>;
  if (!site) return <Card title={tx("Nothing here yet")} text={tx("Check the link you were sent.")} />;
  return <Card site={site} title={tx("Welcome")} text={tx("Use the link {name} sent you to see your gallery or your client page.", { name: site.name })} />;
}

export default function StudioSite() {
  return (
    <Routes>
      <Route path="/g/:token" element={<ClientGallery />} />
      <Route path="/p/:token" element={<Portal />} />
      <Route path="/i/:token" element={<InvoiceView />} />
      <Route path="/:slug" element={<NamedGallery />} />
      <Route path="*" element={<Home />} />
    </Routes>
  );
}
