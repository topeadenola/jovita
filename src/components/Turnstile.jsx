// Cloudflare Turnstile: a free, privacy-friendly "are you human?" check on sign-in, sign-up and password reset.
// Supabase checks the token on its side (Authentication › Attack Protection › CAPTCHA), so bots can't skip it.
import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";

// The site key is public (it's in every page that shows the check). Only on the live site, so local testing isn't blocked.
const LIVE = typeof location !== "undefined" && /(^|\.)getjovita\.com$/.test(location.hostname);
export const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY || (LIVE ? "0x4AAAAAAFvDumn-X-EtEUB7" : "");
let loading = null;
const load = () => (loading ||= new Promise((ok, no) => {
  if (window.turnstile) return ok();
  const s = document.createElement("script");
  s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
  s.async = true; s.onload = () => ok(); s.onerror = no;
  document.head.appendChild(s);
}));

const Turnstile = forwardRef(function Turnstile({ onToken }, ref) {
  const box = useRef(null);
  const id = useRef(null);
  useImperativeHandle(ref, () => ({ reset: () => { if (id.current != null) window.turnstile?.reset(id.current); onToken(""); } }));
  useEffect(() => {
    if (!TURNSTILE_SITE_KEY) return;
    let gone = false;
    load().then(() => {
      if (gone || !box.current) return;
      id.current = window.turnstile.render(box.current, {
        sitekey: TURNSTILE_SITE_KEY, theme: "light", size: "flexible",
        callback: (t) => onToken(t), "expired-callback": () => onToken(""), "error-callback": () => onToken(""),
      });
    }).catch(() => {});
    return () => { gone = true; if (id.current != null) window.turnstile?.remove(id.current); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  if (!TURNSTILE_SITE_KEY) return null;
  return <div ref={box} className="turnstile" />;
});
export default Turnstile;
