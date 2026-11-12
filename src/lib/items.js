// Package and quote items come in a few kinds:
//   standard  – always included (no type, or type "standard")
//   choice    – the client picks ONE item from its group (items share a `group`; `selected` marks the pick)
//   optional  – an extra the client can tick (`selected` = included)
//   picture   – a wide photo shown above or below the items (`path`, `pos`: "top" | "bottom"); never priced
import { supabase } from "../supabase";

export const uid = () => Math.random().toString(36).slice(2, 9);
export const isPic = (it) => it?.type === "picture";
export const isChoice = (it) => it?.type === "choice";
export const isOptional = (it) => it?.type === "optional";
// Counts towards the total (and shows on invoices and PDFs)
export const counts = (it) => !isPic(it) && ((!isChoice(it) && !isOptional(it)) || !!it.selected);
export const hasOptions = (items) => (items || []).some((it) => isChoice(it) || isOptional(it));
export const picUrl = (path) => (path ? supabase.storage.from("studio-assets").getPublicUrl(path).data.publicUrl : "");

// One item as stored (keeps its kind), with a fresh id when `fresh`
export function keepItem(it, fresh, groups = {}) {
  const o = { id: fresh || !it.id ? uid() : it.id, name: it.name || "", description: it.description || "", qty: it.qty ?? 1, price: it.price ?? 0 };
  if (isPic(it)) return { ...o, type: "picture", path: it.path || "", pos: it.pos === "bottom" ? "bottom" : "top", qty: 0, price: 0 };
  if (isChoice(it)) return { ...o, type: "choice", group: fresh ? (groups[it.group] ||= uid()) : it.group || "g", selected: !!it.selected };
  if (isOptional(it)) return { ...o, type: "optional", selected: !!it.selected };
  return o;
}
// Copy a package's items into a quote or invoice: new ids, and choice groups stay together but separate from other copies
export const copyItems = (list) => { const g = {}; return (list || []).map((it) => keepItem(it, true, g)); };

// Each choice group has exactly one pick (the first, if none is marked)
export function fixChoices(items) {
  const seen = {};
  const picked = {};
  (items || []).forEach((it) => { if (isChoice(it) && it.selected && !picked[it.group]) picked[it.group] = it.id; });
  return (items || []).map((it) => {
    if (!isChoice(it)) return it;
    const pick = picked[it.group] || (seen[it.group] ? null : it.id);
    seen[it.group] = true;
    if (!picked[it.group]) picked[it.group] = pick;
    return it.selected === (it.id === picked[it.group]) ? it : { ...it, selected: it.id === picked[it.group] };
  });
}

// Quotes: nothing is picked for the client. They choose the option and any extras on their page.
export const unpick = (items) => (items || []).map((it) => (isChoice(it) || isOptional(it)) && it.selected ? { ...it, selected: false } : it);
// Choice groups with no pick yet (a quote can't be accepted until each has one)
export const openGroups = (items) => { const g = {}; (items || []).forEach((it) => { if (isChoice(it)) g[it.group] = g[it.group] || !!it.selected; }); return Object.keys(g).filter((k) => !g[k]); };

// The client's picks applied to a quote's items (ids of the chosen choice and ticked extras)
export function applyPicks(items, picks) {
  const set = new Set(picks);
  const groupPick = {};
  (items || []).forEach((it) => { if (isChoice(it) && set.has(it.id) && !groupPick[it.group]) groupPick[it.group] = it.id; });
  return (items || []).map((it) => isOptional(it) ? { ...it, selected: set.has(it.id) }
    : isChoice(it) && groupPick[it.group] ? { ...it, selected: it.id === groupPick[it.group] } : it);
}

// For display: pictures at the top, the lines (choice groups kept together, with a heading), pictures at the bottom
export function layout(items) {
  const list = items || [];
  const lines = [];
  let lastGroup = null;
  list.filter((it) => !isPic(it)).forEach((it) => {
    const head = isChoice(it) ? (it.group !== lastGroup ? "choice" : null) : isOptional(it) ? "optional" : null;
    lines.push({ it, head });
    lastGroup = isChoice(it) ? it.group : null;
  });
  return { top: list.filter((it) => isPic(it) && it.pos !== "bottom" && it.path), lines, bottom: list.filter((it) => isPic(it) && it.pos === "bottom" && it.path) };
}
