// Send a contract on its own: pick the contract (and the job, when sending from a client), and the client gets
// an email with the link to read and sign it. A contract lives on a project, so a new job is made if needed.
import { useState } from "react";
import { useData } from "../lib/data";
import { useActions } from "../lib/actions";
import { addDays, first } from "../lib/format";
import { tx } from "../lib/i18n";
import { Modal, useToast } from "./ui";
import Icon from "./Icon";
import ContractPreview from "./ContractPreview";

export default function SendContract({ clientId, projectId, onClose }) {
  const { templates, projects, client, insert, update, studio } = useData();
  const { projectAction } = useActions();
  const toast = useToast();
  const c = client(clientId);
  const contracts = templates.filter((t) => t.kind === "contract").sort((a, b) => (b.is_default - a.is_default) || a.name.localeCompare(b.name));
  const theirs = projects.filter((p) => p.client_id === clientId && !p.contract_signed).sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  const fixed = projects.find((p) => p.id === projectId);
  const [pid, setPid] = useState(fixed?.id || theirs[0]?.id || "new");
  const [title, setTitle] = useState("");
  const cur = projects.find((p) => p.id === pid);
  const [tid, setTid] = useState(cur?.contract_template_id || contracts[0]?.id || "");
  const [busy, setBusy] = useState(false);
  const [look, setLook] = useState(false);
  const send = async (e) => {
    e.preventDefault();
    if (!tid) return;
    if (pid === "new" && !title.trim()) return toast(tx("Say what the job is, e.g. Engagement shoot."));
    setBusy(true);
    try {
      let p = cur;
      if (pid === "new") p = await insert("projects", { client_id: clientId, title: title.trim(), type: "Portrait", stage: "inquiry", amount: 0, currency: studio.home_currency, session_date: addDays(14), contract_template_id: tid });
      else if (p.contract_template_id !== tid) { await update("projects", p.id, { contract_template_id: tid }); p = { ...p, contract_template_id: tid }; }
      onClose();
      await projectAction(p, "contract");
    } catch (x) { toast(x.message); setBusy(false); }
  };
  return (
    <Modal label={tx("Send a contract")} onClose={onClose}>
      <form className="stack" onSubmit={send}>
        <h2 className="h-m">{tx("Send a contract to {name}", { name: first(c.name) })}</h2>
        {!contracts.length ? <p className="sub">{tx("No contracts yet. Add one in Settings › Templates first.")}</p> : (
          <>
            <div className="field"><label htmlFor="sc-t">{tx("Contract")}</label>
              <select id="sc-t" value={tid} onChange={(e) => setTid(e.target.value)}>{contracts.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
              <span className="help">{tx("{name}'s name, address, fee and date fill in by themselves.", { name: first(c.name) })}</span></div>
            {!fixed && (
              <div className="field"><label htmlFor="sc-p">{tx("Which job is it for?")}</label>
                <select id="sc-p" value={pid} onChange={(e) => { setPid(e.target.value); const np = projects.find((p) => p.id === e.target.value); if (np?.contract_template_id) setTid(np.contract_template_id); }}>
                  {theirs.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}<option value="new">{tx("A new job…")}</option></select>
                {pid === "new" && <input style={{ marginTop: 8 }} value={title} onChange={(e) => setTitle(e.target.value)} placeholder={tx("e.g. Wedding photography")} aria-label={tx("Job title")} autoFocus />}</div>
            )}
            <button type="button" className="btn btn-ghost btn-sm" style={{ alignSelf: "flex-start" }} onClick={() => setLook(!look)}><Icon name="eye" />{look ? tx("Hide preview") : tx("Preview what {name} sees", { name: first(c.name) })}</button>
            {look && <ContractPreview template={contracts.find((t) => t.id === tid)} client={c} project={pid === "new" ? { title: title.trim() || tx("New job"), type: "Portrait", amount: 0, currency: studio.home_currency } : cur} />}
            <p className="sub" style={{ fontSize: 13 }}>{tx("{name} gets an email with a link to read and sign it. You'll see when it's signed.", { name: first(c.name) })}</p>
          </>
        )}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}><button type="button" className="btn btn-ghost" onClick={onClose}>{tx("Cancel")}</button>
          <button className="btn btn-primary" disabled={busy || !contracts.length}><Icon name="send" />{busy ? tx("Sending…") : tx("Send contract")}</button></div>
      </form>
    </Modal>
  );
}
