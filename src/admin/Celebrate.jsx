import { useEffect, useRef } from "react";

export function SmileMark({ size = 40, eyes = "#261433", hook = "#FFB320" }) {
  return (
    <svg viewBox="17 17 76 106" width={size * 0.72} height={size} aria-hidden="true">
      <circle cx="32" cy="30" r="11" fill={eyes} /><circle cx="80" cy="30" r="11" fill={eyes} />
      <path d="M80 56 V86 A26 26 0 0 1 28 86" fill="none" stroke={hook} strokeWidth="18" strokeLinecap="round" />
    </svg>
  );
}

// Full-screen milestone moment: confetti in brand colours and the Jovita smile
export default function Celebrate({ goal, metric, onClose }) {
  const cv = useRef(null);
  useEffect(() => {
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const c = cv.current, ctx = c.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    const size = () => { c.width = innerWidth * dpr; c.height = innerHeight * dpr; };
    size(); addEventListener("resize", size);
    const colors = ["#FFB320", "#E9DDFB", "#A07CE0", "#FFFFFF", "#F5C95C"];
    const bits = Array.from({ length: reduce ? 0 : 180 }, () => ({
      x: Math.random() * innerWidth, y: -20 - Math.random() * innerHeight, w: 6 + Math.random() * 8, h: 8 + Math.random() * 10,
      vx: -1 + Math.random() * 2, vy: 2 + Math.random() * 3.5, r: Math.random() * Math.PI, vr: -0.1 + Math.random() * 0.2, c: colors[Math.floor(Math.random() * colors.length)], round: Math.random() < 0.3,
    }));
    let raf, t0 = performance.now();
    const tick = (t) => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, innerWidth, innerHeight);
      const fade = Math.max(0, 1 - (t - t0 - 5000) / 1500);
      for (const b of bits) {
        b.x += b.vx; b.y += b.vy; b.r += b.vr; b.vx += Math.sin((t + b.y) / 400) * 0.02;
        if (b.y > innerHeight + 20 && fade > 0.99) { b.y = -20; b.x = Math.random() * innerWidth; }
        ctx.save(); ctx.globalAlpha = fade; ctx.translate(b.x, b.y); ctx.rotate(b.r); ctx.fillStyle = b.c;
        if (b.round) { ctx.beginPath(); ctx.arc(0, 0, b.w / 2, 0, Math.PI * 2); ctx.fill(); } else ctx.fillRect(-b.w / 2, -b.h / 2, b.w, b.h);
        ctx.restore();
      }
      if (fade > 0) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    const key = (e) => e.key === "Escape" && onClose();
    addEventListener("keydown", key);
    return () => { cancelAnimationFrame(raf); removeEventListener("resize", size); removeEventListener("keydown", key); };
  }, [onClose]);
  const n = new Intl.NumberFormat("en-GB").format(goal);
  return (
    <div className="celebrate" role="dialog" aria-modal="true" aria-labelledby="cel-t">
      <canvas ref={cv} className="confetti" aria-hidden="true" />
      <div className="cel-card">
        <div className="cel-mark"><SmileMark size={96} eyes="#261433" hook="#FFB320" /></div>
        <p className="cel-eyebrow">Milestone reached</p>
        <h1 id="cel-t" className="cel-num">{n}</h1>
        <p className="cel-what">{metric === "paying" ? "paying subscribers" : "studios on Jovita"}</p>
        <p className="cel-sub">{metric === "paying" ? "Creatives are choosing to pay for joy. Thank you for building this." : "That's a lot of creatives running their business with joy."}</p>
        <button type="button" className="a-btn a-btn-gold" autoFocus onClick={onClose}>Celebrate and continue</button>
      </div>
    </div>
  );
}
