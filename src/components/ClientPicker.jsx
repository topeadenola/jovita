// Pick a client by typing part of their name, email or phone (studios can have hundreds).
// Drop-in for <select>: value is the client id, onChange gets the new id.
import { useEffect, useMemo, useRef, useState } from "react";
import { tx } from "../lib/i18n";
import { Avatar } from "./ui";
import { clientMatches } from "../lib/format";
import { useData } from "../lib/data";

const norm = (s) => String(s || "").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "");

export default function ClientPicker({ id, value, onChange, clients, autoFocus }) {
  const current = clients.find((c) => c.id === value);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const [adding, setAdding] = useState(false);
  const { insert } = useData();
  const box = useRef(null);
  const list = useMemo(() => {
    const k = norm(q.trim());
    const hits = k ? clients.filter((c) => norm(`${c.name} ${c.email || ""}`).includes(k) || clientMatches(c, q)) : clients;
    // Names that start with what you typed come first
    return (k ? [...hits].sort((a, b) => (norm(b.name).startsWith(k) ? 1 : 0) - (norm(a.name).startsWith(k) ? 1 : 0)) : hits).slice(0, 8);
  }, [q, clients]);
  useEffect(() => { setHi(0); }, [q]);
  useEffect(() => {
    if (!open) return;
    const h = (e) => { if (!box.current?.contains(e.target)) { setOpen(false); setQ(""); } };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);
  const pick = (c) => { onChange(c.id); setOpen(false); setQ(""); };
  // Not in your clients yet: add them right here (name, or an email address)
  const typed = q.trim();
  const canAdd = typed.length > 1 && !clients.some((c) => norm(c.name) === norm(typed) || norm(c.email) === norm(typed));
  const addNew = async () => {
    if (adding) return;
    setAdding(true);
    try {
      const email = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(typed) ? typed.toLowerCase() : "";
      const c = await insert("clients", { name: email ? email.split("@")[0] : typed, email, phone: "", city: "", status: "client" });
      pick(c);
    } catch { /* the form shows the error when saving */ } finally { setAdding(false); }
  };
  return (
    <div className="cpick" ref={box}>
      <input id={id} type="text" role="combobox" aria-expanded={open} aria-autocomplete="list" autoComplete="off" autoFocus={autoFocus}
        value={open ? q : current?.name || ""} placeholder={open ? (current?.name || tx("Type a name or email")) : tx("Choose a client")}
        onFocus={() => { setOpen(true); setQ(""); }}
        onChange={(e) => { setQ(e.target.value); setOpen(true); }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setHi((h) => Math.min(h + 1, list.length - 1)); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)); }
          else if (e.key === "Enter" && open) { e.preventDefault(); if (list[hi]) pick(list[hi]); else if (canAdd) addNew(); }
          else if (e.key === "Escape" && open) { e.stopPropagation(); setOpen(false); setQ(""); }
        }} />
      {open && (
        <div className="cpick-list" role="listbox">
          {list.map((c, i) => (
            <button type="button" role="option" aria-selected={c.id === value} key={c.id} className={i === hi ? "hi" : ""}
              onMouseEnter={() => setHi(i)} onMouseDown={(e) => e.preventDefault()} onClick={() => pick(c)}>
              <Avatar name={c.name} size={28} /><span><b>{c.name}</b>{c.email && <small>{c.email}</small>}</span>
            </button>
          ))}
          {!list.length && <p className="sub">{tx("No client called \"{q}\"", { q: q.trim() })}</p>}
          {canAdd && <button type="button" className="cpick-add" onMouseDown={(e) => e.preventDefault()} onClick={addNew} disabled={adding}>+ {adding ? tx("Adding…") : tx("Add \"{name}\" as a new client", { name: typed })}</button>}
          {!q.trim() && clients.length > 8 && <p className="sub cpick-more">{tx("Type to search all {n} clients", { n: clients.length })}</p>}
        </div>
      )}
    </div>
  );
}
