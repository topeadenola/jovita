// "Also send to": more people on a project, quote or invoice (e.g. the groom, or a colleague at the same company).
// They get the emails and the client page; the main client is the one who signs and accepts.
import ClientPicker from "./ClientPicker";
import Icon from "./Icon";
import { tx } from "../lib/i18n";

export default function PeoplePicker({ id, value = [], main, clients, onChange }) {
  const ids = (value || []).filter((x) => x && x !== main);
  const chosen = ids.map((x) => clients.find((c) => c.id === x)).filter(Boolean);
  const rest = clients.filter((c) => c.id !== main && !ids.includes(c.id));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {chosen.length > 0 && <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {chosen.map((c) => (
          <span key={c.id} className="gs-chip">{c.name}{c.company ? ` · ${c.company}` : ""}{!c.email && <small className="sub" style={{ fontWeight: 400 }}>{" "}{tx("(no email)")}</small>}
            <button type="button" aria-label={tx("Remove {name}", { name: c.name })} onClick={() => onChange(ids.filter((x) => x !== c.id))}><Icon name="x" /></button></span>
        ))}
      </div>}
      <ClientPicker key={ids.join(",")} id={id} value="" placeholder={tx("Add someone: type a name or email")} clients={rest} onChange={(v) => v && v !== main && onChange([...ids, v])} />
    </div>
  );
}
