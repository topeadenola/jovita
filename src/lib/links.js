// Client-facing links in the studio's own name.
//   horploadworks.getjovita.com/segun-40th     every studio (their link name)
//   gallery.horploadworks.com/segun-40th        Studio plan, their own domain (once it's connected)
// Links built before the studio's details load, or on a computer without the live setup, use the current address.

// On: *.getjovita.com points at the app (Cloudflare DNS + route, set up 30 Oct 2026).
export const STUDIO_LINKS = true;
export const ROOT = "getjovita.com";
const APP_HOSTS = ["app.getjovita.com", "getjovita.com", "www.getjovita.com"];

let current = null;
export function setLinkStudio(studio) { current = studio || null; }

// The address a studio's clients see
export function studioBase(studio = current) {
  if (typeof location === "undefined") return "";
  if (studio?.custom_domain && studio.custom_domain_status === "active") return `https://${studio.custom_domain}`;
  if (STUDIO_LINKS && studio?.slug && /getjovita\.com$/.test(location.hostname)) return `https://${studio.slug}.${ROOT}`;
  return location.origin;
}

// Is this page open on a studio's address (not the Jovita app)?
export function onStudioHost() {
  if (typeof location === "undefined") return false;
  if (typeof window !== "undefined" && window.__STUDIO_HOST) return true; // for testing
  const h = location.hostname;
  if (APP_HOSTS.includes(h) || h === "localhost" || h === "127.0.0.1" || /\.(workers|pages)\.dev$/.test(h)) return false;
  return true;
}
export const hostName = () => (typeof window !== "undefined" && window.__STUDIO_HOST) || location.hostname;

export const portalLink = (token, studio) => `${studioBase(studio)}/p/${token}`;
export const inviteLink = (token, studio) => `${studioBase(studio)}/g/${token}`;
// The gallery's public link: its name when it has one and studio links are on, otherwise its private code
export function publicGalleryLink(g, studio) {
  const base = studioBase(studio);
  return g?.slug && base !== location.origin ? `${base}/${g.slug}` : `${base}/g/${g.share_token}`;
}
