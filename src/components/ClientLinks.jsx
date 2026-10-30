// Settings › Connections: the address clients see on galleries and client pages.
// Every studio: <name>.getjovita.com. Studio plan: their own domain, e.g. gallery.horploadworks.com.
import { useEffect, useState } from "react";
import { supabase } from "../supabase";
import { useData } from "../lib/data";
import { tx } from "../lib/i18n";
import { ROOT, STUDIO_LINKS } from "../lib/links";
import { useToast } from "./ui";
import { useUi } from "./Shell";
import Icon from "./Icon";

const cleanSlug = (v) => v.toLowerCase().replace(/[^a-z0-9-]/g, "").replace(/^-+/, "").slice(0, 40);

async function call(body) {
  const { data, error } = await supabase.functions.invoke("custom-domain", { body });
  if (error) { let m = error.message; try { m = (await error.context.json()).error || m; } catch { /* keep */ } throw new Error(m); }
  if (data?.error) throw new Error(data.error);
  return data;
}

function LinkName() {
  const { studio, updateStudio } = useData();
  const toast = useToast();
  const [val, setVal] = useState(studio.slug || "");
  const [check, setCheck] = useState(null);
  const [busy, setBusy] = useState(false);
  const v = cleanSlug(val).replace(/-+$/, "");
  const same = v === (studio.slug || "");
  useEffect(() => {
    if (same || v.length < 3) { setCheck(null); return; }
    let live = true;
    const t = setTimeout(async () => { const { data } = await supabase.rpc("slug_free", { p_slug: v }); if (live) setCheck(data === true ? "ok" : "taken"); }, 400);
    return () => { live = false; clearTimeout(t); };
  }, [v, same]);
  const save = async () => {
    setBusy(true);
    try { await updateStudio({ slug: v }); toast(tx("Your links now start with {addr}", { addr: `${v}.${ROOT}` }), true); }
    catch (e) { toast(/slug_check/.test(e.message) ? tx("That name isn't allowed. Use 3 or more letters or numbers.") : /slug_key|duplicate/.test(e.message) ? tx("Another studio has that name.") : e.message); }
    setBusy(false);
  };
  return (
    <div className="field"><label htmlFor="cl-slug">{tx("Your link name")}</label>
      <div className="inbox-edit"><span>https://</span><input id="cl-slug" value={val} onChange={(e) => setVal(cleanSlug(e.target.value))} spellCheck={false} autoCapitalize="none" maxLength={40} /><span>.{ROOT}</span></div>
      <span className={`help ${check === "taken" ? "err" : ""}`} role="status">{v.length < 3 ? tx("At least 3 letters or numbers.") : same ? tx("Galleries look like {ex}", { ex: `${v}.${ROOT}/${tx("wedding-ada")}` }) : check === "ok" ? tx("Available") : check === "taken" ? tx("Another studio has that name.") : tx("Checking…")}</span>
      {!same && <div><button type="button" className="btn btn-primary btn-sm" disabled={busy || v.length < 3 || check !== "ok"} onClick={save}>{busy ? tx("Saving…") : tx("Save link name")}</button></div>}
      {!STUDIO_LINKS && <span className="help">{tx("Your links switch to this address soon. Until then they keep working as they are.")}</span>}
    </div>
  );
}

function OwnDomain() {
  const { studio, reload } = useData();
  const ui = useUi();
  const toast = useToast();
  const [domain, setDomain] = useState("");
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState(null); // { status, problem, target }
  const has = !!studio.custom_domain;
  const check = async (quiet) => {
    try { const r = await call({ action: "check" }); setInfo(r); if (r.status !== studio.custom_domain_status) await reload(); if (!quiet) toast(r.status === "active" ? tx("Your domain is live.") : tx("Not live yet. It can take up to an hour after you add the record."), r.status === "active"); }
    catch (e) { if (!quiet) toast(e.message); }
  };
  useEffect(() => { if (has && studio.custom_domain_status !== "active") check(true); }, [has]); // eslint-disable-line react-hooks/exhaustive-deps
  if (studio.plan !== "studio") return (
    <div className="switch"><div><b>{tx("Your own domain")}</b><span>{tx("Use an address like gallery.yourstudio.com. Part of the Studio plan.")}</span></div>
      <button type="button" className="btn btn-secondary btn-sm" onClick={() => ui?.openUpgrade?.("studio")}>{tx("See Studio plan")}</button></div>
  );
  const add = async (e) => {
    e.preventDefault(); setBusy(true);
    try { const r = await call({ action: "add", domain }); setInfo(r); await reload(); setDomain(""); toast(tx("Now add the record below at your domain provider."), true); } catch (x) { toast(x.message); }
    setBusy(false);
  };
  const remove = async () => {
    if (!window.confirm(tx("Disconnect {domain}? Links will use your Jovita address again.", { domain: studio.custom_domain }))) return;
    setBusy(true);
    try { await call({ action: "remove" }); setInfo(null); await reload(); toast(tx("Disconnected")); } catch (x) { toast(x.message); }
    setBusy(false);
  };
  if (!has) return (
    <form className="field" onSubmit={add}><label htmlFor="cl-domain">{tx("Your own domain")}</label>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <input id="cl-domain" style={{ flex: "1 1 220px" }} value={domain} onChange={(e) => setDomain(e.target.value.trim())} placeholder="gallery.yourstudio.com" spellCheck={false} autoCapitalize="none" />
        <button className="btn btn-primary btn-sm" disabled={busy || !domain}>{busy ? tx("Connecting…") : tx("Connect")}</button>
      </div>
      <span className="help">{tx("Use a sub-address like gallery.yourstudio.com, so your main website keeps working.")}</span>
    </form>
  );
  const live = studio.custom_domain_status === "active";
  const sub = studio.custom_domain.split(".").slice(0, -2).join(".");
  return (
    <div className="field"><label>{tx("Your own domain")}</label>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <code className="inbox-addr">{studio.custom_domain}</code>
        <span className={`pill ${live ? "p-success" : "p-warning"}`}>{live ? tx("Live") : tx("Waiting for your record")}</span>
        {!live && <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => check(false)}>{tx("Check now")}</button>}
        <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={remove}>{tx("Disconnect")}</button>
      </div>
      {!live && (
        <div className="dns-steps">
          <p className="sub">{tx("At your domain provider (where you bought the domain), add this record:")}</p>
          <table className="dns-table"><tbody>
            <tr><th>{tx("Type")}</th><td><code>CNAME</code></td></tr>
            <tr><th>{tx("Name")}</th><td><code>{sub}</code></td></tr>
            <tr><th>{tx("Target")}</th><td><code>{info?.target || "studios.getjovita.com"}</code></td></tr>
          </tbody></table>
          {info?.problem && <p className="help">{info.problem}</p>}
          <p className="help">{tx("It usually goes live within an hour. Your links keep using your Jovita address until then.")}</p>
        </div>
      )}
    </div>
  );
}

export default function ClientLinks() {
  return (
    <section className="card set-card">
      <div className="set-head"><h2 className="h-m">{tx("Your client links")}</h2></div>
      <p className="sub">{tx("The address clients see on galleries and client pages, in your studio's name.")}</p>
      <LinkName />
      <OwnDomain />
    </section>
  );
}
