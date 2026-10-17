import { useCallback, useEffect, useRef, useState } from "react";
import { tx } from "./i18n";
import { useUnsaved } from "./unsaved";

// Saves a draft automatically 1 second after the person stops typing.
// Returns [draft, setDraft, status] where status is "idle" | "saving" | "saved" | "error".
export function useAutosave(initial, save, delay = 1000) {
  const [draft, setDraftState] = useState(initial);
  const [status, setStatus] = useState("idle");
  const timer = useRef();
  const latest = useRef(initial);
  const pending = useRef(false);
  const saveRef = useRef(save);
  saveRef.current = save;

  const flush = useCallback(async () => {
    clearTimeout(timer.current);
    if (!pending.current) return;
    pending.current = false;
    setStatus("saving");
    try { await saveRef.current(latest.current); setStatus("saved"); }
    catch (e) { setStatus("error"); console.error(e); }
  }, []);

  const setDraft = useCallback((next) => {
    setDraftState((prev) => {
      const v = typeof next === "function" ? next(prev) : next;
      latest.current = v;
      return v;
    });
    pending.current = true;
    setStatus("typing");
    clearTimeout(timer.current);
    timer.current = setTimeout(flush, delay);
  }, [delay, flush]);

  // Save anything waiting when the editor closes
  useEffect(() => () => { if (pending.current) { pending.current = false; saveRef.current(latest.current).catch(() => {}); } clearTimeout(timer.current); }, []);

  useUnsaved(status === "typing" || status === "saving", flush, { auto: true });
  return [draft, setDraft, status, flush];
}

export function SaveState({ status }) {
  let label = { typing: "Editing…", saving: "Saving…", saved: "All changes saved", error: "Couldn't save. Check your connection." }[status];
  if (!label) return null;
  label = tx(label);
  return <span className={`savestate ${status}`} role="status" aria-live="polite">{label}</span>;
}
