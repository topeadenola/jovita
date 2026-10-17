import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { tx } from "./i18n";

// Nothing gets lost: anything with unsaved typing registers here.
// Leaving the page (menu links, closing a pop-up, closing the tab) asks: Save, Leave without saving, or Stay.
const sources = new Map(); // id -> { save, auto }
let seq = 0;
const listeners = new Set();

export const hasUnsaved = () => [...sources.values()].some((s) => !s.auto);
export async function saveAll() { for (const s of [...sources.values()]) { try { await s.save?.(); } catch (e) { console.error(e); } } }
async function flushAuto() { for (const s of [...sources.values()]) if (s.auto) { try { await s.save?.(); } catch { /* shown by the editor */ } } }

// Register while dirty. auto=true means it saves itself (autosave): we save quietly instead of asking.
export function useUnsaved(dirty, save, { auto = false } = {}) {
  const id = useRef(null);
  if (id.current === null) id.current = ++seq;
  const saveRef = useRef(save);
  saveRef.current = save;
  useEffect(() => {
    if (dirty) sources.set(id.current, { save: () => saveRef.current?.(), auto });
    else sources.delete(id.current);
    return () => { sources.delete(id.current); };
  }, [dirty, auto]);
}

// Ask the person what to do. onSave may throw to keep them on the page.
export function askLeave({ onSave, onLeave, saveCloses = false }) {
  listeners.forEach((fn) => fn({ onSave, onLeave, saveCloses }));
}
// Leave somewhere (run go) only after unsaved work is dealt with
export async function guardLeave(go) {
  await flushAuto();
  if (!hasUnsaved()) return go();
  askLeave({ onSave: saveAll, onLeave: go });
}

export function LeaveGuard() {
  const [ask, setAsk] = useState(null);
  const [busy, setBusy] = useState(false);
  const nav = useNavigate();

  useEffect(() => {
    const h = (a) => setAsk(a);
    listeners.add(h);
    return () => listeners.delete(h);
  }, []);
  // Closing the tab or refreshing
  useEffect(() => {
    const h = (e) => { if (hasUnsaved()) { e.preventDefault(); e.returnValue = ""; } };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, []);
  // In-app links (side menu, buttons that are links)
  useEffect(() => {
    const h = (e) => {
      const a = e.target.closest?.("a[href]");
      if (!a || a.target === "_blank" || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin || url.pathname + url.search === location.pathname + location.search) return;
      if (![...sources.values()].length) return;
      e.preventDefault(); e.stopPropagation();
      guardLeave(() => nav(url.pathname + url.search + url.hash));
    };
    document.addEventListener("click", h, true);
    return () => document.removeEventListener("click", h, true);
  }, [nav]);

  if (!ask) return null;
  const done = () => { setAsk(null); setBusy(false); };
  return (
    <div className="scrim modal-wrap" style={{ zIndex: 90 }} role="presentation">
      <div className="modal leave" role="alertdialog" aria-modal="true" aria-labelledby="leave-t" aria-describedby="leave-d">
        <h2 id="leave-t" className="h-m">{tx("You have unsaved changes")}</h2>
        <p id="leave-d" className="sub">{tx("Do you want to save before you leave?")}</p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
          <button type="button" className="btn btn-ghost" autoFocus onClick={done}>{tx("Stay")}</button>
          <button type="button" className="btn btn-secondary" onClick={() => { const go = ask.onLeave; sources.forEach((s, k) => { if (!s.auto) sources.delete(k); }); done(); go?.(); }}>{tx("Leave without saving")}</button>
          <button type="button" className="btn btn-primary" disabled={busy} onClick={async () => {
            setBusy(true);
            try { await ask.onSave?.(); const go = ask.saveCloses ? null : ask.onLeave; done(); go?.(); } catch { setBusy(false); }
          }}>{busy ? tx("Saving…") : tx("Save and leave")}</button>
        </div>
      </div>
    </div>
  );
}
