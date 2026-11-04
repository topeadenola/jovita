import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useData } from "../lib/data";
import { supabase } from "../supabase";
import Icon from "../components/Icon";
import { MoneyInput, Pill, Toggle, useToast } from "../components/ui";
import { CURRENCIES, SYM, money } from "../lib/format";
import { FIELDS, fill, values } from "../lib/merge";
import { tx } from "../lib/i18n";
import StudioLogo from "../components/StudioLogo";
import { guardLeave, useUnsaved } from "../lib/unsaved";
import ItemsEditor from "../components/ItemsEditor";
import { counts, isChoice, isOptional, keepItem, layout, picUrl } from "../lib/items";

const KINDS = [
  ["contract", "Contracts", "The agreement clients sign in their portal before you shoot."],
  ["model_release", "Model releases", "Permission to use images of the client in your portfolio and marketing."],
  ["invoice", "Packages", "Packages with line items. Pick one when you create a quote or an invoice."],
  ["email", "Emails", "Messages you send at each step. Merge fields fill in automatically."],
];
const BLANK = {
  contract: { name: "New contract", body: "This agreement is between {studio_name} and {client_name} for a {project_type} session on {session_date}.\n\n1. Fee\nThe total fee is {project_amount}.\n" },
  model_release: { name: "New model release", body: "I, {client_name}, give {studio_name} permission to use images taken on {session_date} for portfolio and promotional use.\n" },
  invoice: { name: "New package", body: "Thank you for your business.", items: [{ name: "Session", description: "", qty: 1, price: 0 }] },
  email: { name: "New email", subject: "A note from {studio_name}", body: "Hi {client_first_name},\n\n\n\n{studio_name}" },
};

function Editor({ t, onDirty }) {
  const { studio, update, insert, remove, templates, clients = [], projects = [], bookings = [] } = useData();
  const [who, setWho] = useState(""); // preview with one of your clients ("" = example client)
  const toast = useToast();
  // Items get ids once (older packages didn't store them), so "unsaved" compares like with like
  const [base] = useState(() => ({ name: t.name, subject: t.subject || "", body: t.body || "", items: (t.items || []).map((it) => keepItem(it)), currency: t.currency, is_default: t.is_default }));
  const [f, setF] = useState(base);
  const [busy, setBusy] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const area = useRef(null);
  const dirty = JSON.stringify(f) !== JSON.stringify(base);
  useEffect(() => { onDirty(dirty); }, [dirty, onDirty]);
  useUnsaved(dirty, () => save(true));
  const pc = clients.find((c) => c.id === who);
  const pp = pc ? projects.filter((x) => x.client_id === pc.id).sort((a, b) => (a.created_at < b.created_at ? 1 : -1))[0] : null;
  const vals = values({ studio, client: pc, project: pp, booking: pp ? bookings.find((b) => b.project_id === pp.id) : null });
  const lay = layout(f.items);
  const total = f.items.filter(counts).reduce((s, it) => s + Number(it.qty || 0) * Number(it.price || 0), 0);

  const insertField = (key) => {
    const el = area.current; const token = `{${key}}`;
    if (!el) return setF({ ...f, body: f.body + token });
    const s = el.selectionStart ?? f.body.length, e = el.selectionEnd ?? s;
    const body = f.body.slice(0, s) + token + f.body.slice(e);
    setF({ ...f, body });
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(s + token.length, s + token.length); });
  };

  async function save(strict) {
    if (!f.name.trim()) { toast(tx("Give the template a name.")); if (strict) throw new Error("name"); return; }
    setBusy(true);
    try {
      if (f.is_default && !t.is_default) {
        await Promise.all(templates.filter((x) => x.kind === t.kind && x.is_default && x.id !== t.id).map((x) => update("templates", x.id, { is_default: false })));
      }
      await update("templates", t.id, { ...f, name: f.name.trim(), subject: t.kind === "email" ? f.subject : null, updated_at: new Date().toISOString() });
      toast(tx("Template saved"));
    } catch (e) { toast(e.message); if (strict) throw e; } finally { setBusy(false); }
  }

  return (
    <div className="tpl-editor">
      <section className="card tpl-form">
        <div className="field"><label htmlFor="t-name">{tx("Template name")}</label><input id="t-name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
        {t.kind === "email" && <div className="field"><label htmlFor="t-subject">{tx("Subject line")}</label><input id="t-subject" value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })} /></div>}

        {t.kind === "invoice" && (
          <div className="field">
            <span style={{ fontSize: 13, fontWeight: 600 }}>{tx("Line items")}</span>
            <div className="inv-items-head" aria-hidden="true"><span>{tx("Item")}</span><span>{tx("Qty")}</span><span>{tx("Price")}</span><span className="right">{tx("Amount")}</span></div>
            <ItemsEditor items={f.items} onChange={(items) => setF({ ...f, items })} currency={f.currency} minItems={0} />
            <b className="num" style={{ alignSelf: "flex-end" }}>{tx("Total")}{" "}{money(total, f.currency)}</b>
            <div className="field" style={{ maxWidth: 220 }}><label htmlFor="t-cur">{tx("Currency")}</label>
              <select id="t-cur" value={f.currency} onChange={(e) => setF({ ...f, currency: e.target.value })}>{CURRENCIES.map((c) => <option key={c} value={c}>{c} ({SYM[c]})</option>)}</select></div>
          </div>
        )}

        <div className="field">
          <label htmlFor="t-body">{t.kind === "invoice" ? tx("Notes and payment terms") : t.kind === "email" ? tx("Message") : tx("Wording")}</label>
          {t.kind !== "invoice" && (
            <div className="chips" aria-label={tx("Insert a merge field")}>
              {FIELDS.filter(([k]) => t.kind === "email" || !k.startsWith("invoice")).map(([k, l]) => <button type="button" key={k} className="chip" onClick={() => insertField(k)}>+ {tx(l)}</button>)}
            </div>
          )}
          <textarea id="t-body" ref={area} className="tpl-body" style={t.kind === "invoice" ? { height: 110 } : undefined} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} />
          {t.kind !== "invoice" && <span className="help">{tx("Words in curly brackets, like")}{" "}{tx("{client_name}")}{tx(", fill in for each client.")}</span>}
        </div>

        <div className="switch"><div><b>{tx("Use by default")}</b><span>{tx("New projects and invoices start with this one.")}</span></div><Toggle on={f.is_default} label={tx("Use by default")} onChange={(v) => setF({ ...f, is_default: v })} /></div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <button className="btn btn-primary" disabled={busy || !dirty} onClick={() => save()}>{busy ? tx("Saving…") : dirty ? tx("Save changes") : tx("Saved")}</button>
          <button className="btn btn-secondary" onClick={async () => {
            const { id, created_at, updated_at, studio_id, ...rest } = t; // eslint-disable-line no-unused-vars
            await insert("templates", { ...rest, ...f, name: `${f.name} (copy)`, is_default: false });
            toast(tx("Copy created"));
          }}>{tx("Duplicate")}</button>
          <span style={{ flex: 1 }} />
          {confirmDel ? (<><span className="sub" style={{ fontSize: 13 }}>{tx("Delete this template?")}</span><button className="btn btn-ghost btn-sm" onClick={() => setConfirmDel(false)}>{tx("Keep")}</button>
            <button className="btn btn-sm" style={{ background: "var(--danger-tint)", color: "var(--danger)" }} onClick={async () => { await remove("templates", t.id); toast(tx("Template deleted")); }}>{tx("Delete")}</button></>)
            : <button className="btn btn-ghost btn-sm" style={{ color: "var(--danger)" }} onClick={() => setConfirmDel(true)}>{tx("Delete")}</button>}
        </div>
      </section>
      <section className="tpl-preview" aria-label={tx("Preview")}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
          <p className="eyebrow" style={{ margin: 0 }}>{tx("Preview with")}</p>
          <select value={who} onChange={(e) => setWho(e.target.value)} aria-label={tx("Preview with")} style={{ width: "auto", minWidth: 180 }}>
            <option value="">{tx("An example client")}</option>
            {[...clients].sort((a, b) => a.name.localeCompare(b.name)).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        {!who && <p className="sub" style={{ fontSize: 12, marginBottom: 8 }}>{tx("When you send it, each client sees their own name, address, fee and date.")}</p>}
        <div className="doc">
          <div className="doc-head"><StudioLogo studio={studio} /><div><b>{studio.name}</b><p className="sub" style={{ fontSize: 12 }}>{tx(KINDS.find((k) => k[0] === t.kind)[1].replace(/s$/, ""))}</p></div></div>
          {t.kind === "email" && <p style={{ fontWeight: 700 }}>{fill(f.subject, vals)}</p>}
          {t.kind === "invoice" ? (
            <>
              <h3 className="h-m">{f.name}</h3>
              {lay.top.map((p) => <img key={p.id} className="doc-pic" src={picUrl(p.path)} alt="" />)}
              <table className="doc-table"><tbody>
                {lay.lines.filter(({ it }) => Number(it.qty) > 0).map(({ it, head }) => (<Fragment key={it.id}>
                  {head && <tr className="doc-kind"><td colSpan={2}>{head === "choice" ? tx("Choose one") : tx("Optional extra")}</td></tr>}
                  <tr className={(isChoice(it) || isOptional(it)) && !it.selected ? "doc-off" : undefined}><td><b>{(isChoice(it) || isOptional(it)) && <span className="doc-mark">{isChoice(it) ? (it.selected ? "◉ " : "○ ") : it.selected ? "☑ " : "☐ "}</span>}{it.name || tx("Item")}{it.qty > 1 ? ` × ${it.qty}` : ""}</b>{String(it.description || "").replace(/^\s*-\s*$/, "") && <div className="sub" style={{ fontSize: 12, whiteSpace: "pre-line" }}>{it.description}</div>}</td><td className="right num">{money(it.qty * it.price, f.currency)}</td></tr>
                </Fragment>))}
                <tr><td><b>{tx("Total")}</b></td><td className="right num"><b>{money(total, f.currency)}</b></td></tr>
              </tbody></table>
              {lay.bottom.map((p) => <img key={p.id} className="doc-pic" src={picUrl(p.path)} alt="" />)}
              <p className="doc-text">{f.body}</p>
            </>
          ) : <p className="doc-text">{fill(f.body, vals)}</p>}
          {(t.kind === "contract" || t.kind === "model_release") && <div className="doc-sign"><span>{tx("Signed by")}{" "}{vals.client_name}</span><span>{tx("Typed signature in the client portal")}</span></div>}
        </div>
      </section>
    </div>
  );
}

export default function Templates({ embedded }) {
  const { templates, insert, reload } = useData();
  const toast = useToast();
  const [kind, setKind] = useState("contract");
  const [adding, setAdding] = useState(false);
  // Jovita's ready-made set: wedding, portrait, family and couple contracts, a model release, client emails and packages
  const addStarters = async () => {
    setAdding(true);
    try {
      const { data, error } = await supabase.rpc("add_my_starter_templates");
      if (error) throw error;
      await reload();
      toast(data ? tx("Added {n} ready-made templates", { n: data }) : tx("You already have all of Jovita's ready-made templates"), !!data);
    } catch (e) { toast(e.message); } finally { setAdding(false); }
  };
  const [sel, setSel] = useState(null);
  const [dirty, setDirty] = useState(false);
  const list = useMemo(() => templates.filter((t) => t.kind === kind).sort((a, b) => (b.is_default - a.is_default) || a.name.localeCompare(b.name)), [templates, kind]);
  const current = list.find((t) => t.id === sel) || list[0];
  const guard = (fn) => guardLeave(() => { setDirty(false); fn(); });
  const meta = KINDS.find((k) => k[0] === kind);

  return (
    <>
      <div className="head"><div>{!embedded && <p className="eyebrow">{tx("Templates")}</p>}<h1 className={embedded ? "h-m" : "h-l"}>{tx("Your contracts, releases, invoices and emails")}</h1>
        <p className="sub" style={{ marginTop: 6 }}>{tx(
          "Write them once. Every client gets their own copy with their details filled in."
        )}</p></div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button className="btn btn-secondary" disabled={adding} onClick={addStarters}><Icon name="star" />{adding ? tx("Adding…") : tx("Add ready-made templates")}</button>
        <button className="btn btn-primary" onClick={async () => {
          const b = BLANK[kind];
          const t = await insert("templates", { kind, ...b, name: tx(b.name), body: tx(b.body), ...(b.subject ? { subject: tx(b.subject) } : {}), ...(b.items ? { items: b.items.map((it) => ({ ...it, name: tx(it.name) })) } : {}), is_default: list.length === 0 });
          setSel(t.id); toast(tx("Template created"));
        }}><Icon name="plus" />{tx("New")}{" "}{meta[1].toLowerCase().replace(/s$/, "")}</button></div></div>
      <div className="tabs" role="tablist">{KINDS.map(([k, l]) => <button key={k} role="tab" aria-selected={kind === k} onClick={() => guard(() => { setKind(k); setSel(null); })}>{tx(l)} <span className="count">{templates.filter((t) => t.kind === k).length}</span></button>)}</div>
      <p className="sub">{meta[2]}{(kind === "contract" || kind === "model_release") && " " + tx("Ready-made contracts are a starting point, not legal advice. Check them against your local law.")}</p>
      <div className="tpl-layout">
        <nav className="tpl-list" aria-label={meta[1]}>
          {list.map((t) => (
            <button key={t.id} className="tpl-item" aria-current={current?.id === t.id} onClick={() => guard(() => setSel(t.id))}>
              <b>{t.name}</b>{t.is_default && <Pill c="p-joy">{tx("Default")}</Pill>}
            </button>
          ))}
          {!list.length && <p className="sub" style={{ padding: 12 }}>{tx("None yet. Create one with the button above.")}</p>}
        </nav>
        {current && <Editor key={current.id + current.updated_at} t={current} onDirty={setDirty} />}
      </div>
    </>
  );
}
