// Full-screen slideshow for clients (Pro and Studio galleries). Plays the photos in view, one after another.
// Space plays or pauses, arrows step, Esc closes. Swipe on phones. Controls fade away while it plays.
import { useCallback, useEffect, useRef, useState } from "react";
import { tx } from "../lib/i18n";
import Icon from "./Icon";
import { isRaw, publicUrl, thumbUrl } from "./GalleryEditor";

const SPEEDS = [3, 5, 8];
const src = (p) => (isRaw(p.path) ? thumbUrl(p.path) : publicUrl(p.path));

export default function Slideshow({ photos, start = 0, title, onClose, wm }) {
  const box = useRef(null);
  const [i, setI] = useState(Math.min(start, photos.length - 1));
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(5);
  const [ui, setUi] = useState(true);
  const hide = useRef();
  const touch = useRef(null);
  const n = photos.length;
  const go = useCallback((d) => setI((x) => (x + d + n) % n), [n]);

  // Full screen where the browser allows it (otherwise it still fills the window)
  useEffect(() => {
    const el = box.current;
    el?.requestFullscreen?.().catch(() => {});
    const out = () => { if (!document.fullscreenElement) onClose(); };
    document.addEventListener("fullscreenchange", out);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("fullscreenchange", out);
      document.body.style.overflow = "";
      if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    };
  }, [onClose]);

  useEffect(() => {
    if (!playing || n < 2) return;
    const t = setTimeout(() => go(1), speed * 1000);
    return () => clearTimeout(t);
  }, [playing, speed, i, go, n]);

  // Load the next two in the background so each change is instant
  useEffect(() => { [1, 2].forEach((k) => { const p = photos[(i + k) % n]; if (p) { const im = new Image(); im.src = src(p); } }); }, [i, photos, n]);

  const wake = useCallback(() => {
    setUi(true);
    clearTimeout(hide.current);
    hide.current = setTimeout(() => setUi(false), 2500);
  }, []);
  useEffect(() => { wake(); return () => clearTimeout(hide.current); }, [wake]);

  useEffect(() => {
    const k = (e) => {
      if (e.key === "Escape") { e.preventDefault(); onClose(); }
      else if (e.key === " ") { e.preventDefault(); setPlaying((p) => !p); wake(); }
      else if (e.key === "ArrowRight") { go(1); wake(); }
      else if (e.key === "ArrowLeft") { go(-1); wake(); }
    };
    document.addEventListener("keydown", k);
    return () => document.removeEventListener("keydown", k);
  }, [go, onClose, wake]);

  const p = photos[i];
  return (
    <div ref={box} className={`ss ${ui ? "ui" : ""}${wm ? " wm-on" : ""}`} style={wm?.style} onContextMenu={wm ? (e) => e.preventDefault() : undefined} role="dialog" aria-modal="true" aria-label={tx("Slideshow")}
      onMouseMove={wake} onClick={wake}
      onTouchStart={(e) => { touch.current = e.touches[0].clientX; wake(); }}
      onTouchEnd={(e) => { const dx = e.changedTouches[0].clientX - (touch.current ?? 0); if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1); touch.current = null; }}>
      <img key={p.id} className="ss-img" src={src(p)} alt={p.name || ""} onError={(e) => { const t = thumbUrl(p.path); if (e.currentTarget.src !== t) e.currentTarget.src = t; }} />
      <div className="ss-top">
        <span>{title}</span>
        <button type="button" className="ss-btn" onClick={(e) => { e.stopPropagation(); onClose(); }} aria-label={tx("Close slideshow")}><Icon name="x" /></button>
      </div>
      <div className="ss-bar" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="ss-btn" onClick={() => go(-1)} aria-label={tx("Previous photo")}><span style={{ display: "inline-flex", transform: "rotate(180deg)" }}><Icon name="arrow" /></span></button>
        <button type="button" className="ss-btn ss-play" onClick={() => setPlaying(!playing)} aria-label={playing ? tx("Pause") : tx("Play")}>{playing ? <span className="ss-pause" /> : <span className="ss-tri" />}</button>
        <button type="button" className="ss-btn" onClick={() => go(1)} aria-label={tx("Next photo")}><Icon name="arrow" /></button>
        <span className="ss-count">{i + 1} / {n}</span>
        <span className="ss-speed" role="group" aria-label={tx("Speed")}>
          {SPEEDS.map((s) => <button key={s} type="button" aria-pressed={speed === s} onClick={() => setSpeed(s)}>{s}s</button>)}
        </span>
      </div>
      <div className="ss-progress"><span key={`${i}-${playing}-${speed}`} style={{ animationDuration: `${speed}s`, animationPlayState: playing ? "running" : "paused" }} /></div>
    </div>
  );
}
