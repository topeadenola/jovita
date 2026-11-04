// What the client will actually read: the contract filled in with THEIR name, address, fee and date
// (the template page shows an example client; this shows the real one before you send).
import { useData } from "../lib/data";
import { fill, values } from "../lib/merge";
import { tx } from "../lib/i18n";
import StudioLogo from "./StudioLogo";

// The details that fill a contract for this client and job (the job's booking gives the location)
export function useMergeValues(client, project) {
  const { studio, bookings = [] } = useData();
  const booking = project ? bookings.filter((b) => b.project_id === project.id).sort((a, b) => (a.starts_at < b.starts_at ? -1 : 1))[0] : null;
  return values({ studio, client, project, booking });
}

export default function ContractPreview({ template, client, project }) {
  const { studio } = useData();
  const vals = useMergeValues(client, project);
  if (!template) return null;
  return (
    <div className="doc" style={{ maxHeight: "50vh", overflow: "auto" }}>
      <div className="doc-head"><StudioLogo studio={studio} /><div><b>{studio.name}</b><p className="sub" style={{ fontSize: 12 }}>{tx("Contract")}</p></div></div>
      <p className="doc-text">{fill(template.body || "", vals)}</p>
      <div className="doc-sign"><span>{tx("Signed by")}{" "}{vals.client_name}</span><span>{tx("Typed signature in the client portal")}</span></div>
    </div>
  );
}
