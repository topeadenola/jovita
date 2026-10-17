import { useState } from "react";
import { useData } from "../lib/data";
import { useUi } from "../components/Shell";
import Icon from "../components/Icon";
import { Avatar, Empty, Pill } from "../components/ui";
import { STAGES, STAGE_LABEL, fdate, first, money, nextStep, projPill } from "../lib/format";
import { tx } from "../lib/i18n";

export default function Projects() {
  const { projects, client } = useData();
  const { q, open, setOpenProject } = useUi();
  const [mode, setMode] = useState(() => { try { return localStorage.getItem("jv-projmode") || "board"; } catch { return "board"; } });
  const setM = (m) => { setMode(m); try { localStorage.setItem("jv-projmode", m); } catch { /* ignore */ } };
  const ql = q.toLowerCase();
  const list = projects.filter((p) => !ql || (p.title + " " + client(p.client_id).name).toLowerCase().includes(ql));

  const Card = ({ p }) => {
    const c = client(p.client_id); const n = nextStep(p); const pl = projPill(p);
    return (
      <button className="pcard" onClick={() => setOpenProject(p.id)}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "flex-start", width: "100%" }}>
          <div style={{ minWidth: 0 }}><h4>{tx("{name}'s {title}", { name: first(c.name), title: p.title.toLowerCase() })}</h4><p className="meta">{tx(p.type)} · {fdate(p.session_date)}{c.city ? ` · ${c.city}` : ""}</p></div>
          <Avatar name={c.name} size={28} />
        </div>
        <Pill c={pl.c}>{pl.k}</Pill>
        <div className="foot"><span className="amt num">{money(p.amount, p.currency)}</span><span className="next">{n.t} →</span></div>
      </button>
    );
  };

  return (
    <>
      <div className="head"><div><p className="eyebrow">{tx("Projects")}</p><h1 className="h-l">{tx("Your pipeline")}</h1></div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <div className="seg" role="group" aria-label={tx("View")}><button aria-pressed={mode === "board"} onClick={() => setM("board")}>{tx("Board")}</button><button aria-pressed={mode === "list"} onClick={() => setM("list")}>{tx("List")}</button></div>
          <button className="btn btn-primary" onClick={() => open("project")}><Icon name="plus" />{tx("New project")}</button>
        </div></div>
      {!projects.length ? <Empty title={tx("No projects yet")} text={tx("A project holds the quote, contract, invoices and gallery for one job.")} action={<button className="btn btn-primary" onClick={() => open("project")}>{tx("New project")}</button>} />
        : mode === "board" ? (
          <div className="board">
            {STAGES.map((s) => { const items = list.filter((p) => p.stage === s); return (
              <section className="col" aria-label={tx(STAGE_LABEL[s])} key={s}>
                <div className="col-head"><b>{tx(STAGE_LABEL[s])}</b><span className="count">{items.length}</span></div>
                {items.map((p) => <Card p={p} key={p.id} />)}
                {!items.length && <p className="sub" style={{ fontSize: 13, padding: 6 }}>{tx("Nothing here yet")}</p>}
              </section>
            ); })}
          </div>
        ) : (
          <div className="tablewrap"><table><thead><tr><th>{tx("Project")}</th><th>{tx("Stage")}</th><th>{tx("Status")}</th><th>{tx("Date")}</th><th className="right">{tx("Value")}</th><th>{tx("Next step")}</th></tr></thead><tbody>
            {list.map((p) => { const pl = projPill(p); return (
              <tr className="click" key={p.id} tabIndex={0} onClick={() => setOpenProject(p.id)} onKeyDown={(e) => e.key === "Enter" && setOpenProject(p.id)}>
                <td><div className="who"><Avatar name={client(p.client_id).name} /><div><b>{client(p.client_id).name}</b><small>{p.title}</small></div></div></td>
                <td>{tx(STAGE_LABEL[p.stage])}</td><td><Pill c={pl.c}>{pl.k}</Pill></td><td>{fdate(p.session_date)}</td>
                <td className="right num">{money(p.amount, p.currency)}</td><td style={{ fontWeight: 600, color: "var(--marigold-text)" }}>{nextStep(p).t}</td>
              </tr>
            ); })}
          </tbody></table></div>
        )}
    </>
  );
}
