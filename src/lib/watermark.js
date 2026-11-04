// Watermarks on client galleries: the studio name (or any text) or the studio logo, in a corner, the centre, or repeated
// across the photo. Drawn over the photo on the client's page (the original file stays clean for downloads).
import { supabase } from "../supabase";

export const WM_POS = [["center", "Centre"], ["br", "Bottom right"], ["bl", "Bottom left"], ["tr", "Top right"], ["tl", "Top left"], ["tile", "Repeat across"]];
export const WM_DEFAULT = { kind: "none", text: "", logo_path: "", pos: "br", size: 22, opacity: 55 };
const POS = { center: "center", br: "right 4% bottom 4%", bl: "left 4% bottom 4%", tr: "right 4% top 4%", tl: "left 4% top 4%", tile: "0 0" };
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// The text drawn as a small SVG picture (white with a soft dark outline, readable on light and dark photos)
function textSvg(text, tile) {
  const t = String(text || "").slice(0, 60) || "©";
  const w = Math.max(120, t.length * 26 + 40), h = 64;
  const pad = tile ? 60 : 0;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w + pad}" height="${h + pad}" viewBox="0 0 ${w + pad} ${h + pad}"><defs><filter id="s" x="-10%" y="-40%" width="120%" height="180%"><feDropShadow dx="0" dy="1.5" stdDeviation="2.5" flood-color="#000" flood-opacity="0.55"/></filter></defs><text filter="url(#s)" x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-weight="700" font-size="40" fill="#ffffff" stroke="#000000" stroke-opacity="0.35" stroke-width="1.5"${tile ? ` transform="rotate(-24 ${(w + pad) / 2} ${(h + pad) / 2})"` : ""}>${esc(t)}</text></svg>`;
  return `url("data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}")`;
}
const logoUrl = (path) => (path ? supabase.storage.from("studio-assets").getPublicUrl(path).data.publicUrl : "");

// Style for the box around a photo: CSS variables read by .wm-on::after. Null when there's no watermark.
export function wmStyle(wm, studioName = "") {
  if (!wm || !wm.kind || wm.kind === "none") return null;
  if (wm.kind === "logo" && !wm.logo_path) return null;
  const tile = wm.pos === "tile";
  const img = wm.kind === "logo" ? `url("${logoUrl(wm.logo_path)}")` : textSvg(wm.text || studioName, tile);
  const size = Math.min(80, Math.max(5, Number(wm.size) || 22));
  return {
    "--wm-img": img,
    "--wm-pos": POS[wm.pos] || POS.br,
    "--wm-size": `${tile ? Math.max(12, size * 0.8) : size}% auto`,
    "--wm-rep": tile ? "space" : "no-repeat",
    "--wm-op": String(Math.min(95, Math.max(8, Number(wm.opacity) || 55)) / 100),
  };
}

// Props for a protected photo box: the watermark, and no right-click "Save image" or dragging the photo out
export function wmProps(wm, studioName) {
  const style = wmStyle(wm, studioName);
  if (!style) return null;
  return { className: "wm-on", style, onContextMenu: (e) => e.preventDefault(), onDragStart: (e) => e.preventDefault() };
}
