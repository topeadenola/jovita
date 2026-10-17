import { useEffect, useState } from "react";
import Jo from "./Jo";
import { tx } from "../lib/i18n";

// Fire from anywhere: celebratePaid({ name, amount, label })
export const celebratePaid = (detail) => window.dispatchEvent(new CustomEvent("jovita:paid", { detail }));

const COLS = ["#FFB320", "#E9DDFB", "#F7A6C0", "#FFFFFF", "#E89A00"];

export default function PaidMoment({ onThanks }) {
  const [p, setP] = useState(null);
  useEffect(() => {
    const h = (e) => setP(e.detail);
    window.addEventListener("jovita:paid", h);
    return () => window.removeEventListener("jovita:paid", h);
  }, []);
  useEffect(() => {
    if (!p) return;
    const h = (e) => e.key === "Escape" && setP(null);
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [p]);
  if (!p) return null;
  return (
    <div className="paid-wrap" onMouseDown={(e) => e.target === e.currentTarget && setP(null)}>
      <div className="paid" role="dialog" aria-modal="true" aria-label={tx("You got paid")}>
        {Array.from({ length: 14 }, (_, i) => (
          <span key={i} className="confetti" style={{ left: `${(i * 53 + 17) % 96}%`, width: 6 + (i % 3) * 3, height: 10 + (i % 2) * 4, background: COLS[i % 5], animationDuration: `${2.4 + (i % 5) * 0.5}s`, animationDelay: `${(i * 0.37) % 2.2}s` }} />
        ))}
        <Jo mood="paid" size={150} />
        <p style={{ marginTop: 16, fontWeight: 600 }}>{tx("{name} just paid", { name: p.name })}</p>
        <span className="amt num">{p.amount}</span>
        <p style={{ fontSize: 14 }}>{p.label ? p.label + " · " : ""}{tx("Invoice closed. Reminders stop for you.")}</p>
        <div className="btns">
          {onThanks && p.clientId && <button type="button" className="btn btn-joy" onClick={() => { onThanks(p); setP(null); }}>{tx("Send a thank-you")}</button>}
          <button type="button" className="btn btn-out" onClick={() => setP(null)} autoFocus>{tx("Lovely, back to work")}</button>
        </div>
      </div>
    </div>
  );
}
