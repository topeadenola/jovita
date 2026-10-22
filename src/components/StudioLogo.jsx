import { useRef, useState } from "react";
import { supabase } from "../supabase";
import { useData } from "../lib/data";
import { useToast } from "./ui";
import Icon from "./Icon";
import { tx } from "../lib/i18n";

export const logoUrl = (path) => (path ? supabase.storage.from("studio-assets").getPublicUrl(path).data.publicUrl : "");

// The studio's logo, or its initials when there's no logo yet
export default function StudioLogo({ studio, className = "studio-mark", style }) {
  const [broken, setBroken] = useState(false);
  // Your own logo is a Pro and Studio feature; Free shows initials
  const url = studio?.plan === "free" ? "" : logoUrl(studio?.logo_path);
  if (url && !broken) return <span className={`${className} has-logo`} style={style}><img src={url} alt={studio?.name || ""} onError={() => setBroken(true)} /></span>;
  return <span className={className} style={style}>{(studio?.name || "S").split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase()}</span>;
}

// Settings › Your studio: upload, replace or remove the logo
export function LogoUploader({ onUpgrade }) {
  const { studio, updateStudio } = useData();
  const toast = useToast();
  const input = useRef(null);
  const [busy, setBusy] = useState(false);
  const upload = async (file) => {
    if (!file) return;
    if (!/^image\/(png|jpeg|webp|svg\+xml)$/.test(file.type)) return toast(tx("Use a PNG, JPG, WebP or SVG file."));
    if (file.size > 5 * 1024 * 1024) return toast(tx("Logos can be up to 5 MB."));
    setBusy(true);
    try {
      const ext = (file.name.split(".").pop() || "png").toLowerCase();
      const path = `${studio.id}/logo-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("studio-assets").upload(path, file, { contentType: file.type, cacheControl: "3600" });
      if (error) throw error;
      const old = studio.logo_path;
      await updateStudio({ logo_path: path });
      if (old) supabase.storage.from("studio-assets").remove([old]).catch(() => {});
      toast(tx("Logo updated. It now shows on your invoices, contracts and client links."), true);
    } catch (e) { toast(tx("Couldn't upload the logo: {err}", { err: e.message })); } finally { setBusy(false); }
  };
  const removeLogo = async () => {
    if (!window.confirm(tx("Remove your logo? It disappears from invoices, galleries and emails."))) return;
    const old = studio.logo_path;
    await updateStudio({ logo_path: null });
    if (old) supabase.storage.from("studio-assets").remove([old]).catch(() => {});
    toast(tx("Logo removed"));
  };
  if ((studio.plan || "free") === "free") return (
    <div className="logo-up locked">
      <StudioLogo studio={studio} className="logo-preview" />
      <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
        <b>{tx("Studio logo")} <span className="pro-tag">Pro</span></b>
        <span className="sub" style={{ fontSize: 13 }}>{tx("Put your logo on invoices, contracts, galleries and client links, and remove the Jovita mark. Included in Pro and Studio.")}</span>
        <div><button type="button" className="btn btn-primary btn-sm" onClick={onUpgrade}><Icon name="star" />{tx("Upgrade to add your logo")}</button></div>
      </div>
    </div>
  );
  return (
    <div className="logo-up">
      <StudioLogo studio={studio} className="logo-preview" />
      <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
        <b>{tx("Studio logo")}</b>
        <span className="sub" style={{ fontSize: 13 }}>{tx("Shows on invoices, contracts, model releases, galleries and your client links. PNG or SVG with a clear background works best.")}</span>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => input.current?.click()}><Icon name="image" />{busy ? tx("Uploading…") : studio.logo_path ? tx("Replace logo") : tx("Upload logo")}</button>
          {studio.logo_path && <button type="button" className="btn btn-ghost btn-sm" onClick={removeLogo}>{tx("Remove")}</button>}
        </div>
      </div>
      <input ref={input} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" hidden onChange={(e) => { upload(e.target.files?.[0]); e.target.value = ""; }} />
    </div>
  );
}
