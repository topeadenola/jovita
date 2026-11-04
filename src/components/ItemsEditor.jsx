// The item list for packages, quotes and invoices: standard items, client's choice (pick one), optional extras, and pictures.
import { useRef, useState } from "react";
import { useData } from "../lib/data";
import { supabase } from "../supabase";
import { money, SYM } from "../lib/format";
import { tx } from "../lib/i18n";
import { enterBullet, pasteBullets, toBullets } from "../lib/bullets";
import { fixChoices, isChoice, isOptional, isPic, picUrl, uid } from "../lib/items";
import { MoneyInput, Pill, useToast } from "./ui";
import Icon from "./Icon";

const n = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const blank = () => ({ id: uid(), name: "", description: "", qty: 1, price: 0 });

function Picture({ it, onChange, onRemove }) {
  const { studio } = useData();
  const toast = useToast();
  const input = useRef(null);
  const [busy, setBusy] = useState(false);
  const upload = async (file) => {
    if (!file) return;
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) return toast(tx("Use a PNG, JPG or WebP photo."));
    if (file.size > 8 * 1024 * 1024) return toast(tx("Photos can be up to 8 MB."));
    setBusy(true);
    try {
      const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
      const path = `${studio.id}/packages/${Date.now()}-${uid()}.${ext}`;
      const { error } = await supabase.storage.from("studio-assets").upload(path, file, { contentType: file.type, cacheControl: "3600" });
      if (error) throw error;
      onChange({ path });
    } catch (e) { toast(tx("Couldn't upload the photo: {err}", { err: e.message })); } finally { setBusy(false); }
  };
  return (
    <div className="inv-pic">
      {it.path ? <img src={picUrl(it.path)} alt="" /> : (
        <button type="button" className="inv-pic-empty" onClick={() => input.current?.click()} disabled={busy}><Icon name="image" />{busy ? tx("Uploading…") : tx("Add a wide photo")}</button>
      )}
      <div className="inv-pic-bar">
        <span className="seg" role="group" aria-label={tx("Where the photo goes")}>
          <button type="button" aria-pressed={it.pos !== "bottom"} onClick={() => onChange({ pos: "top" })}>{tx("Top")}</button>
          <button type="button" aria-pressed={it.pos === "bottom"} onClick={() => onChange({ pos: "bottom" })}>{tx("Bottom")}</button>
        </span>
        <span style={{ flex: 1 }} />
        {it.path && <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => input.current?.click()}>{busy ? tx("Uploading…") : tx("Replace")}</button>}
        <button type="button" className="btn btn-ghost btn-sm" style={{ color: "var(--danger)" }} onClick={onRemove}>{tx("Remove photo")}</button>
      </div>
      <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => { upload(e.target.files?.[0]); e.target.value = ""; }} />
    </div>
  );
}

export default function ItemsEditor({ items, onChange, currency, minItems = 1 }) {
  const [menu, setMenu] = useState(false);
  const set = (list) => onChange(fixChoices(list));
  const setItem = (iid, patch) => set(items.map((it) => (it.id === iid ? { ...it, ...patch } : it)));
  const remove = (iid) => set(items.filter((y) => y.id !== iid));
  const move = (iid, dir) => {
    const a = [...items]; const i = a.findIndex((it) => it.id === iid); const j = i + dir;
    if (j < 0 || j >= a.length) return;
    [a[i], a[j]] = [a[j], a[i]]; set(a);
  };
  const add = (kind) => {
    setMenu(false);
    if (kind === "choice") { const g = uid(); return set([...items, { ...blank(), type: "choice", group: g, selected: true }, { ...blank(), type: "choice", group: g, selected: false }]); }
    if (kind === "optional") return set([...items, { ...blank(), type: "optional", selected: false }]);
    if (kind === "picture") return set([...items, { ...blank(), type: "picture", path: "", pos: "top", qty: 0, price: 0 }]);
    set([...items, blank()]);
  };
  // "+ Add option" after the last item of a choice group
  const addOption = (group, afterId) => {
    const a = [...items]; const i = a.findIndex((it) => it.id === afterId);
    a.splice(i + 1, 0, { ...blank(), type: "choice", group, selected: false });
    set(a);
  };
  const lines = items.filter((it) => !isPic(it)).length;

  return (
    <>
      {items.map((it, ix) => {
        const prev = items[ix - 1], next = items[ix + 1];
        if (isPic(it)) return (
          <div className="inv-item inv-item-pic" key={it.id}>
            <Picture it={it} onChange={(p) => setItem(it.id, p)} onRemove={() => remove(it.id)} />
          </div>
        );
        const firstOfGroup = isChoice(it) && !(isChoice(prev) && prev.group === it.group);
        const lastOfGroup = isChoice(it) && !(isChoice(next) && next.group === it.group);
        return (
          <div key={it.id} className={`inv-item-wrap${isChoice(it) ? " is-choice" : isOptional(it) ? " is-optional" : ""}${firstOfGroup ? " first" : ""}${lastOfGroup ? " last" : ""}`}>
            {firstOfGroup && <div className="inv-kind"><Pill c="p-info">{tx("Client's choice")}</Pill><span className="sub">{tx("Your client picks one. The one you tick is picked to start with.")}</span></div>}
            {isOptional(it) && <div className="inv-kind"><Pill c="p-warning">{tx("Optional extra")}</Pill><span className="sub">{tx("Your client can tick it to add it.")}</span></div>}
            <div className="inv-item">
              <div className="inv-item-main">
                <div className="inv-name-row">
                  {isChoice(it) && <input type="radio" name={`pick-${it.group}`} checked={!!it.selected} onChange={() => set(items.map((x) => (isChoice(x) && x.group === it.group ? { ...x, selected: x.id === it.id } : x)))} aria-label={tx("Picked to start with")} title={tx("Picked to start with")} />}
                  {isOptional(it) && <input type="checkbox" checked={!!it.selected} onChange={(e) => setItem(it.id, { selected: e.target.checked })} aria-label={tx("Included to start with")} title={tx("Included to start with")} />}
                  <input className="inv-name" value={it.name} onChange={(e) => setItem(it.id, { name: e.target.value })} placeholder={isChoice(it) ? tx("Option, e.g. Gold package") : isOptional(it) ? tx("Extra, e.g. Second photobook") : tx("Heading, e.g. Amber Portrait Package")} aria-label={tx("Item name")}
                    onPaste={(e) => {
                      // A pasted list goes into the description, one "- " line per item
                      const raw = e.clipboardData?.getData("text/plain") || "";
                      const list = toBullets(raw);
                      if (list === raw) return;
                      e.preventDefault();
                      const desc = String(it.description || "").replace(/^\s*-\s*$/, "");
                      setItem(it.id, { description: desc ? `${desc}\n${list}` : list });
                    }} />
                </div>
                <textarea className="inv-desc" value={it.description} onChange={(e) => setItem(it.id, { description: e.target.value })}
                  onKeyDown={(e) => enterBullet(e, (v) => setItem(it.id, { description: v }))}
                  onPaste={(e) => pasteBullets(e, it.description || "", (v) => setItem(it.id, { description: v }))}
                  onFocus={() => { if (!it.description) setItem(it.id, { description: "- " }); }}
                  onBlur={() => { if (/^\s*-\s*$/.test(it.description)) setItem(it.id, { description: "" }); }}
                  placeholder={tx("- Lead photographer\n- 1 hour, 1 look\n- 5 retouched photos")} aria-label={tx("Item description")} rows={Math.min(12, Math.max(2, String(it.description || "").split("\n").length + 1))} />
              </div>
              <input className="inv-num" type="number" min="0" step="1" value={it.qty} onChange={(e) => setItem(it.id, { qty: e.target.value })} aria-label={tx("Quantity")} />
              <label className="inv-price"><span>{SYM[currency] || ""}</span><MoneyInput value={it.price} onChange={(v) => setItem(it.id, { price: v })} aria-label={tx("Price")} /></label>
              <div className="inv-amt"><b className="num">{money(n(it.qty) * n(it.price), currency)}</b>
                <div className="inv-tools">
                  <button type="button" onClick={() => move(it.id, -1)} disabled={ix === 0} aria-label={tx("Move up")}>↑</button>
                  <button type="button" onClick={() => move(it.id, 1)} disabled={ix === items.length - 1} aria-label={tx("Move down")}>↓</button>
                  <button type="button" onClick={() => remove(it.id)} disabled={lines <= minItems} aria-label={tx("Remove item")}><Icon name="x" /></button>
                </div>
              </div>
            </div>
            {lastOfGroup && <button type="button" className="btn btn-ghost btn-sm inv-add-opt" onClick={() => addOption(it.group, it.id)}><Icon name="plus" />{tx("Add option")}</button>}
          </div>
        );
      })}
      <div style={{ position: "relative", alignSelf: "flex-start" }}>
        <button type="button" className="btn btn-ghost btn-sm" aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu((v) => !v)}><Icon name="plus" />{tx("Add item")}</button>
        {menu && (
          <div className="menu inv-add-menu" role="menu" onMouseLeave={() => setMenu(false)}>
            <button type="button" role="menuitem" onClick={() => add("standard")}><span className="inv-mi" style={{ background: "var(--sunken)" }}>=</span><span><b>{tx("Standard item")}</b><small>{tx("Always included")}</small></span></button>
            <button type="button" role="menuitem" onClick={() => add("choice")}><span className="inv-mi" style={{ background: "var(--info-tint)", color: "var(--info)" }}>◉</span><span><b>{tx("Client's choice")}</b><small>{tx("Your client picks one option")}</small></span></button>
            <button type="button" role="menuitem" onClick={() => add("optional")}><span className="inv-mi" style={{ background: "var(--warning-tint)", color: "var(--warning)" }}>☑</span><span><b>{tx("Optional item")}</b><small>{tx("Your client can tick to add it")}</small></span></button>
            <button type="button" role="menuitem" onClick={() => add("picture")}><span className="inv-mi" style={{ background: "var(--success-tint)", color: "var(--success)" }}><Icon name="image" /></span><span><b>{tx("Picture")}</b><small>{tx("A wide photo at the top or bottom")}</small></span></button>
          </div>
        )}
      </div>
    </>
  );
}
