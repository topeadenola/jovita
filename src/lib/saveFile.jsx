import { useEffect, useState } from "react";
import { tx } from "./i18n";

// Saving a file that works on phones too.
// Computers and Android: a normal download.
// iPhone / iPad (and phones that support it): the share sheet, so people can tap "Save to Files", AirDrop, WhatsApp…
// If the phone says the tap was too long ago (making the PDF took a moment), we show a small "ready" box with a Save button.
const listeners = new Set();

const touch = () => typeof window !== "undefined" && (window.matchMedia?.("(pointer: coarse)").matches || /iPhone|iPad|iPod|Android/i.test(navigator.userAgent));
const ios = () => /iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

function canShare(file) {
  try { return !!navigator.canShare?.({ files: [file] }); } catch { return false; }
}

function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name; a.rel = "noopener";
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

async function share(file) {
  await navigator.share({ files: [file], title: file.name });
}

// Returns "saved", "shared", "cancelled" or "ask" (the ready box is showing)
export async function saveFile(blob, name, type = blob.type || "application/octet-stream") {
  const file = new File([blob], name, { type });
  if (touch() && canShare(file)) {
    try { await share(file); return "shared"; }
    catch (e) {
      if (e?.name === "AbortError") return "cancelled";
      // Tap expired while we were building the file: ask for one more tap
      listeners.forEach((fn) => fn({ file }));
      return "ask";
    }
  }
  if (ios()) { listeners.forEach((fn) => fn({ file })); return "ask"; }
  download(blob, name);
  return "saved";
}

export function FileReady() {
  const [ask, setAsk] = useState(null);
  useEffect(() => {
    const h = (a) => setAsk(a);
    listeners.add(h);
    return () => listeners.delete(h);
  }, []);
  if (!ask) return null;
  const close = () => setAsk(null);
  const save = async () => {
    const { file } = ask;
    if (canShare(file)) {
      try { await share(file); } catch { /* cancelled */ }
    } else {
      // Older phones: open the PDF; the browser's Share button there saves it
      const url = URL.createObjectURL(file);
      window.open(url, "_blank");
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    }
    close();
  };
  return (
    <div className="scrim modal-wrap" style={{ zIndex: 90 }} role="presentation" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="modal leave" role="alertdialog" aria-modal="true" aria-labelledby="file-t" aria-describedby="file-d">
        <h2 id="file-t" className="h-m">{tx("Your PDF is ready")}</h2>
        <p id="file-d" className="sub">{ask.file.name}</p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
          <button type="button" className="btn btn-ghost" onClick={close}>{tx("Cancel")}</button>
          <button type="button" className="btn btn-primary" autoFocus onClick={save}>{tx("Save PDF")}</button>
        </div>
      </div>
    </div>
  );
}
