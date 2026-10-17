import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import Icon, { Mark } from "./Icon";
import { tx } from "../lib/i18n";
import { askLeave } from "../lib/unsaved";

/* ---------- Toasts ---------- */
const ToastCtx = createContext(() => {});
export const useToast = () => useContext(ToastCtx);
export function ToastProvider({ children }) {
  const [t, setT] = useState(null);
  const timer = useRef();
  const show = useCallback((msg, wink = false) => {
    setT({ msg, wink, key: Date.now() });
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setT(null), 3200);
  }, []);
  return (
    <ToastCtx.Provider value={show}>
      {children}
      {t && (
        <div className="toast" role="status" key={t.key}>
          {t.wink ? <Mark dot="#FBF8FF" className="wink" /> : <Icon name="check" />}
          <span>{t.msg}</span>
        </div>
      )}
    </ToastCtx.Provider>
  );
}

/* ---------- Pills, avatars ---------- */
export const Pill = ({ c, children }) => <span className={`pill ${c}`}>{typeof children === "string" ? tx(children) : children}</span>;
export const Avatar = ({ name, size }) => {
  const n = (name || "?").split(/\s+/).filter(Boolean).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  return <span className="avatar" style={size ? { width: size, height: size, fontSize: size / 3 } : undefined}>{n}</span>;
};

/* ---------- Overlays ---------- */
function useEscape(onClose) {
  useEffect(() => {
    const h = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [onClose]);
}
export function Drawer({ label, onClose, children }) {
  useEscape(onClose);
  return (
    <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside className="drawer" role="dialog" aria-modal="true" aria-label={label}>{children}</aside>
    </div>
  );
}
export function Modal({ label, onClose, children, wide }) {
  // If anything was typed, closing asks first (Save / Leave without saving / Stay)
  const dirty = useRef(false);
  const box = useRef(null);
  const requestClose = useCallback(() => {
    if (!dirty.current) return onClose();
    const form = box.current?.querySelector("form");
    askLeave({ onSave: form ? () => form.requestSubmit() : undefined, onLeave: onClose, saveCloses: !!form });
  }, [onClose]);
  useEscape(requestClose);
  return (
    <div className="scrim modal-wrap" onMouseDown={(e) => e.target === e.currentTarget && requestClose()}>
      <div ref={box} className="modal" role="dialog" aria-modal="true" aria-label={label} style={wide ? { width: "min(820px,100%)" } : undefined}
        onInput={() => { dirty.current = true; }}
        onClickCapture={(e) => { if (e.target.closest("[data-dismiss]")) { e.preventDefault(); e.stopPropagation(); requestClose(); } }}>{children}</div>
    </div>
  );
}
export const CloseBtn = ({ onClick }) => (
  <button type="button" className="x" data-dismiss onClick={onClick} aria-label={tx("Close")}><Icon name="x" /></button>
);

export function Toggle({ on, label, onChange }) {
  return <button type="button" className="toggle" role="switch" aria-checked={!!on} aria-label={label} onClick={() => onChange(!on)} />;
}

export function CopyBox({ value, label }) {
  const toast = useToast();
  const copy = () => {
    try {
      navigator.clipboard.writeText(value).then(() => toast(tx("Link copied")), () => toast(tx("Copy this: ") + value));
    } catch {
      toast(tx("Copy this: ") + value);
    }
  };
  return (
    <div className="linkbox">
      <code>{value}</code>
      <button type="button" className="btn btn-secondary btn-sm" onClick={copy}><Icon name="link" />{label || tx("Copy link")}</button>
    </div>
  );
}

export function Empty({ icon = "folder", title, text, action }) {
  return (
    <div className="empty card">
      <span className="dot d-joy"><Icon name={icon} /></span>
      <b style={{ color: "var(--ink)" }}>{title}</b>
      <p>{text}</p>
      {action}
    </div>
  );
}
