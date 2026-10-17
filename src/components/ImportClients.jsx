import { useMemo, useState } from "react";
import { supabase } from "../supabase";
import { useData } from "../lib/data";
import Icon from "./Icon";
import { CloseBtn, Modal, useToast } from "./ui";
import { tx, txn } from "../lib/i18n";

// What Jovita stores, and the column names people tend to use for it in old spreadsheets
const FIELDS = [
  ["name", "Full name", ["name", "full name", "fullname", "client", "client name", "customer", "customer name", "contact", "contact name", "nom complet", "nom du client", "client", "nombre completo", "nombre del cliente", "nome completo", "nome do cliente", "jina", "jina kamili"]],
  ["first", "First name", ["first name", "firstname", "first", "given name", "forename", "prénom", "prenom", "nombre", "nome", "primeiro nome", "nome próprio", "jina la kwanza"]],
  ["last", "Last name", ["last name", "lastname", "last", "surname", "family name", "nom", "nom de famille", "apellido", "apellidos", "apelido", "sobrenome", "jina la ukoo"]],
  ["email", "Email", ["email", "e-mail", "email address", "mail", "courriel", "adresse e-mail", "adresse mail", "correo", "correo electrónico", "barua pepe"]],
  ["phone", "Phone / WhatsApp", ["phone", "phone number", "mobile", "mobile number", "whatsapp", "tel", "telephone", "cell", "contact number", "téléphone", "telephone", "portable", "numéro", "teléfono", "móvil", "celular", "telefone", "telemóvel", "telemovel", "simu", "namba ya simu"]],
  ["city", "City", ["city", "town", "location", "state", "region", "ville", "commune", "ciudad", "cidade", "localidade", "mji"]],
  ["status", "Lead or client", ["status", "type", "stage", "category", "statut", "estado", "hali"]],
];
const norm = (s) => String(s ?? "").toLowerCase().replace(/[_\-.]+/g, " ").replace(/\s+/g, " ").trim();
const digits = (s) => String(s ?? "").replace(/\D/g, "");
const TEMPLATE = "Full name,Email,Phone,City,Status\nAdaeze Okafor,adaeze@example.com,+234 803 000 1101,Lagos,client\nChloe Bennett,chloe@example.co.uk,+44 7700 900123,London,lead\n";

function guessMap(headers) {
  const m = {};
  const used = new Set();
  const exact = (words) => headers.findIndex((h, i) => !used.has(i) && words.includes(norm(h)));
  // 1. exact names first, for every field
  FIELDS.forEach(([k, , words]) => { const i = exact(words); if (i >= 0) { m[k] = i; used.add(i); } });
  // 2. then looser matches ("Client E-mail", "Phone no."), most specific fields first
  ["first", "last", "email", "phone", "city", "status", "name"].forEach((k) => {
    if (m[k] !== undefined) return;
    const words = FIELDS.find((f) => f[0] === k)[2];
    const i = headers.findIndex((h, j) => !used.has(j) && words.some((w) => w.length > 3 && norm(h).includes(w)));
    if (i >= 0) { m[k] = i; used.add(i); }
  });
  if (m.first !== undefined && m.name !== undefined) delete m.name;
  if (m.name !== undefined) { delete m.first; delete m.last; }
  return m;
}

export default function ImportClients({ onClose }) {
  const { clients, studio, reload } = useData();
  const toast = useToast();
  const [file, setFile] = useState(null); // {name, headers, rows}
  const [map, setMap] = useState({});
  const [defStatus, setDefStatus] = useState("client");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);

  async function read(f) {
    setErr("");
    try {
      const XLSX = await import("xlsx");
      // Text files (CSV) are read as UTF-8 so names like Aïcha and Prénom come through intact
      const isText = /\.(csv|tsv|txt)$/i.test(f.name) || /^text\//.test(f.type);
      const wb = isText ? XLSX.read((await f.text()).replace(/^\uFEFF/, ""), { type: "string", raw: false }) : XLSX.read(await f.arrayBuffer(), { type: "array", raw: false });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const all = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", blankrows: false, raw: false });
      const h = all.findIndex((r) => r.filter((c) => String(c).trim()).length >= 2);
      if (h < 0) throw new Error(tx(
        "We couldn't find a header row. The first row should name the columns, like Name, Email, Phone."
      ));
      const headers = all[h].map((c, i) => String(c).trim() || `Column ${i + 1}`);
      const rows = all.slice(h + 1).filter((r) => r.some((c) => String(c).trim()));
      if (!rows.length) throw new Error(tx("That sheet has headers but no clients under them."));
      setFile({ name: f.name, headers, rows });
      setMap(guessMap(headers));
    } catch (e) { setErr(e.message || tx("We couldn't read that file. Try saving it as CSV.")); }
  }

  const result = useMemo(() => {
    if (!file) return null;
    const seenE = new Set(clients.map((c) => (c.email || "").toLowerCase()).filter(Boolean));
    const seenP = new Set(clients.map((c) => digits(c.phone)).filter((d) => d.length >= 7));
    const get = (r, k) => (map[k] === undefined ? "" : String(r[map[k]] ?? "").trim());
    const ok = [], dupes = [], bad = [];
    file.rows.forEach((r) => {
      const name = get(r, "name") || [get(r, "first"), get(r, "last")].filter(Boolean).join(" ");
      const email = get(r, "email").toLowerCase();
      const phone = get(r, "phone");
      const st = norm(get(r, "status"));
      const row = {
        name: name || email.split("@")[0] || "",
        email: /\S+@\S+\.\S+/.test(email) ? email : null,
        phone: phone || null, city: get(r, "city") || null,
        status: st ? (/(lead|prospect|enquir|inquir|potential|potentiel|posible|potencial|mtarajiwa)/.test(st) ? "lead" : "client") : defStatus,
      };
      if (!row.name) { bad.push(r); return; }
      const d = digits(phone);
      if ((row.email && seenE.has(row.email)) || (d.length >= 7 && seenP.has(d))) { dupes.push(row); return; }
      if (row.email) seenE.add(row.email);
      if (d.length >= 7) seenP.add(d);
      ok.push(row);
    });
    return { ok, dupes, bad };
  }, [file, map, defStatus, clients]);

  const hasName = map.name !== undefined || map.first !== undefined || map.last !== undefined || map.email !== undefined;

  async function doImport() {
    setBusy(true); setErr("");
    try {
      const rows = result.ok.map((r) => ({ ...r, studio_id: studio.id }));
      for (let i = 0; i < rows.length; i += 500) {
        const { error } = await supabase.from("clients").insert(rows.slice(i, i + 500));
        if (error) throw error;
      }
      await reload();
      toast(txn(rows.length, "{n} client imported", "{n} clients imported"), true);
      onClose();
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  }

  const downloadTemplate = () => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([TEMPLATE], { type: "text/csv" }));
    a.download = "jovita-clients-template.csv"; a.click(); URL.revokeObjectURL(a.href);
  };

  return (
    <Modal label={tx("Import clients")} onClose={onClose} wide>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div><h2 className="h-l">{tx("Bring your clients over")}</h2><p className="sub" style={{ fontSize: 14 }}>{tx(
            "From a CSV or Excel file, Google Sheets, Pixieset, HoneyBook, Dubsado or your phone contacts export."
          )}</p></div>
          <CloseBtn onClick={onClose} />
        </div>

        {!file ? (
          <>
            <label className={`drop${drag ? " on" : ""}`}
              onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
              onDrop={(e) => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files?.[0]; if (f) read(f); }}>
              <input type="file" accept=".csv,.tsv,.txt,.xlsx,.xls,.ods,.numbers" onChange={(e) => e.target.files?.[0] && read(e.target.files[0])} />
              <span className="dot d-joy"><Icon name="file" /></span>
              <b>{tx("Drop your file here, or click to choose")}</b>
              <span className="sub" style={{ fontSize: 13 }}>{tx(
                "CSV, Excel (.xlsx, .xls) or OpenDocument. The first row should be the column names."
              )}</span>
            </label>
            <div className="card" style={{ background: "var(--sunken)", borderColor: "var(--sunken)", fontSize: 14, display: "flex", flexDirection: "column", gap: 6 }}>
              <b>{tx("Where's my file?")}</b>
              <span><b>{tx("Google Sheets:")}</b>{" "}{tx("File → Download → Comma-separated values (.csv).")}</span>
              <span><b>{tx("Pixieset, HoneyBook, Dubsado:")}</b>{" "}{tx("Contacts or Clients → Export to CSV.")}</span>
              <span><b>{tx("Starting fresh?")}</b> <button type="button" className="btn btn-ghost btn-sm" onClick={downloadTemplate}>{tx("Download our template")}</button></span>
            </div>
          </>
        ) : (
          <>
            <div className="card" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                <b>{file.name}· {file.rows.length}{" "}{tx("row")}{file.rows.length === 1 ? "" : "s"}</b>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setFile(null); setMap({}); }}>{tx("Choose another file")}</button>
              </div>
              <p className="sub" style={{ fontSize: 13 }}>{tx("We matched your columns. Change any that look wrong.")}</p>
              <div className="mapgrid">
                {FIELDS.map(([k, label]) => (
                  <div className="field" key={k}><label htmlFor={`m-${k}`}>{tx(label)}</label>
                    <select id={`m-${k}`} value={map[k] ?? ""} onChange={(e) => setMap({ ...map, [k]: e.target.value === "" ? undefined : Number(e.target.value) })}>
                      <option value="">{tx("Not in my file")}</option>
                      {file.headers.map((h, i) => <option key={i} value={i}>{h}</option>)}
                    </select></div>
                ))}
                {map.status === undefined && (
                  <div className="field"><label htmlFor="m-def">{tx("Everyone is a")}</label>
                    <select id="m-def" value={defStatus} onChange={(e) => setDefStatus(e.target.value)}><option value="client">{tx("Client")}</option><option value="lead">{tx("Lead")}</option></select></div>
                )}
              </div>
            </div>

            {!hasName ? <p className="err">{tx("Pick which column has the client's name (or first name).")}</p> : (
              <>
                <div className="tablewrap"><table><thead><tr><th>{tx("Name")}</th><th>{tx("Email")}</th><th>{tx("Phone")}</th><th>{tx("City")}</th><th>{tx("Status")}</th></tr></thead><tbody>
                  {result.ok.slice(0, 6).map((r, i) => <tr key={i}><td><b>{r.name}</b></td><td>{r.email || "—"}</td><td className="num">{r.phone || "—"}</td><td>{r.city || "—"}</td><td>{r.status === "lead" ? tx("Lead") : tx("Client")}</td></tr>)}
                  {!result.ok.length && <tr><td colSpan={5} className="sub">{tx("Nothing new to import.")}</td></tr>}
                </tbody></table></div>
                <p className="sub" style={{ fontSize: 14 }}>
                  <b style={{ color: "var(--ink)" }}>{result.ok.length}{" "}{tx("ready to import")}</b>
                  {result.ok.length > 6 ? tx(" (showing the first 6)") : ""}
                  {result.dupes.length ? tx(" · {length} already in Jovita, skipped", {
                    length: result.dupes.length
                  }) : ""}
                  {result.bad.length ? tx(" · {length} without a name, skipped", {
                    length: result.bad.length
                  }) : ""}
                </p>
              </>
            )}
          </>
        )}
        {err && <p className="err" role="alert">{err}</p>}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <button type="button" className="btn btn-ghost" data-dismiss onClick={onClose}>{tx("Cancel")}</button>
          {file && <button type="button" className="btn btn-primary" disabled={busy || !hasName || !result?.ok.length} onClick={doImport}>
            {busy ? tx("Importing…") : txn(result?.ok.length || 0, "Import {n} client", "Import {n} clients")}</button>}
        </div>
      </div>
    </Modal>
  );
}
