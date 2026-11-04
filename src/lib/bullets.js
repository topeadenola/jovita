// "- " lists in item descriptions: Enter starts the next "- " line, and a pasted list (•, *, –, numbers kept) keeps one item per line.
const MARK = /^\s*(?:[-•*–—◦▪·●○■□➢➤►▸]\s*|\t+)/;

// Turns pasted text into "- " lines (blank lines dropped). Single-line text is left as it is.
export function toBullets(text) {
  const lines = String(text || "").replace(/\r/g, "").split("\n").map((l) => l.replace(MARK, "").trim()).filter(Boolean);
  // Some apps copy a list as one line: "* One * Two * Three"
  if (lines.length === 1 && /^\s*[*•]\s/.test(text) && /\s[*•]\s/.test(text)) return text.split(/\s*[*•]\s+/).map((l) => l.trim()).filter(Boolean).map((l) => `- ${l}`).join("\n");
  return lines.length > 1 || MARK.test(text) ? lines.map((l) => `- ${l}`).join("\n") : String(text || "");
}

// Paste into a description box: insert the list as "- " lines at the cursor
export function pasteBullets(e, value, set) {
  const raw = e.clipboardData?.getData("text/plain") || "";
  const list = toBullets(raw);
  if (list === raw) return; // plain text: let the browser paste it
  e.preventDefault();
  const t = e.currentTarget, a = t.selectionStart ?? value.length, b = t.selectionEnd ?? a;
  const before = value.slice(0, a).replace(/(^|\n)\s*-\s*$/, "$1"); // replace an empty "- " the cursor sits on
  const ins = (before && !before.endsWith("\n") ? "\n" : "") + list;
  const next = before + ins + value.slice(b);
  set(next);
  requestAnimationFrame(() => { const p = (before + ins).length; t.setSelectionRange?.(p, p); });
}

// Enter on a "- " line starts the next one; Enter on an empty "- " line ends the list
export function enterBullet(e, set) {
  if (e.key !== "Enter" || e.shiftKey) return;
  const t = e.currentTarget, v = t.value, a = t.selectionStart;
  const line = v.slice(v.lastIndexOf("\n", a - 1) + 1, a);
  if (!/^\s*[-•]\s/.test(line) && v.trim()) return;
  e.preventDefault();
  if (/^\s*[-•]\s*$/.test(line)) { const st = a - line.length; set(v.slice(0, st) + v.slice(a)); return; }
  const ins = (v.trim() ? "\n" : "") + "- ";
  if (!document.execCommand?.("insertText", false, ins)) set(v.slice(0, a) + ins + v.slice(t.selectionEnd));
}

// "- - Lead photographer" (an auto "- " plus one typed by hand) becomes "- Lead photographer"
export const tidyBullets = (text) => String(text ?? "").replace(/^([ \t]*[-•][ \t]+)(?:[-•][ \t]+)+/gm, "$1");
