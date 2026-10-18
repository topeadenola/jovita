// Ask Jovita, v1: smart rules over the studio's own data. No AI service, no cost.
// Each answer is { text, drafts?, chips? }. Drafts are messages the user sends themselves
// (WhatsApp, email or copy) — Jovita never sends or touches money on its own.
import { daysFrom, fday, first, ftime, invState, money, portalUrl, totalsBy } from "./format";
import { summary } from "./accounting";
import { draftNudge, draftReply } from "./voice";
import { tx, txn } from "./i18n";

const has = (q, words) => words.some((w) => q.includes(w));
const list = (arr) => (arr.length <= 1 ? arr.join("") : arr.slice(0, -1).join(", ") + " " + tx("and") + " " + arr[arr.length - 1]);
const totals = (invs) => Object.entries(totalsBy(invs)).map(([c, v]) => money(v, c));

export const SUGGESTIONS = ["How much am I owed?", "What's on this week?", "Who hasn't signed?", "How many galleries do I have?", "Draft a reply", "How much did I make this month?"];
const STAGE_NAMES = { inquiry: "enquiry", booked: "booked", shooting: "shooting", editing: "editing", delivered: "delivered" };

export function answer(raw, d) {
  const q = ` ${String(raw || "").toLowerCase()} `;
  const { studio, invoices = [], projects = [], bookings = [], messages = [], expenses = [], subscriptions = [], galleries = [], clients = [], client } = d;
  const tone = { warmth: studio.tone_warmth ?? 2, length: studio.tone_length ?? 1, signer: studio.owner_first_name || "" };

  const open = invoices.filter((i) => i.status === "sent");
  const late = open.filter((i) => invState(i).k === "Overdue");
  const soon = open.filter((i) => invState(i).k === "Due soon");

  const nudgeDraft = (i) => {
    const c = client(i.client_id);
    const p = i.project_id && projects.find((x) => x.id === i.project_id);
    return {
      to: c.name, phone: c.phone, email: c.email, invoiceId: i.id,
      subject: tx("Invoice #{number}", { number: i.number }),
      text: draftNudge({ name: first(c.name), amount: money(i.amount, i.currency), label: i.label.toLowerCase(), late: invState(i).late || 0, link: p ? portalUrl(p.portal_token) : "", ...tone }),
    };
  };

  // "How many …" questions
  const GAL = ["galler", "galer", "gallar", "galar", "album", "collection"];
  if (has(q, ["how many", "ow many", "many ", "number of", "count", "list my", "show my", "show me my", "all my", " my "]) && has(q, [...GAL, "client", "customer", "people", "lead", "enquir", "inquir", "project", "job", "invoice", "booking", "session"])) {
    if (has(q, GAL)) {
      if (!galleries.length) return { text: tx("No galleries yet. Create one in Galleries and add your photos.") };
      const pub = galleries.filter((g) => g.status === "delivered").length;
      return { text: txn(galleries.length, "You have {n} gallery", "You have {n} galleries") + tx(" ({pub} published, {draft} draft):", { pub, draft: galleries.length - pub }) + "\n" + galleries.slice(0, 8).map((g) => `• ${g.title} · ${client(g.client_id).name} · ${txn(g.photo_count || 0, "{n} photo", "{n} photos")}`).join("\n") };
    }
    if (has(q, ["client", "customer", "people"])) {
      const leads = clients.filter((c) => c.status === "lead").length;
      return { text: txn(clients.length, "You have {n} contact", "You have {n} contacts") + tx(": {c} clients and {l} leads.", { c: clients.length - leads, l: leads }) };
    }
    if (has(q, ["lead", "enquir", "inquir"])) return answer("leads", d);
    if (has(q, ["project", "job", "shoot"])) {
      const by = {}; projects.forEach((p) => { by[p.stage] = (by[p.stage] || 0) + 1; });
      return { text: txn(projects.length, "{n} project", "{n} projects") + ": " + Object.entries(by).map(([k, v]) => `${v} ${tx(STAGE_NAMES[k] || k)}`).join(", ") + "." };
    }
    if (has(q, ["invoice"])) {
      const by = {}; invoices.forEach((i) => { const k = invState(i).k; by[k] = (by[k] || 0) + 1; });
      return { text: txn(invoices.length, "{n} invoice", "{n} invoices") + ": " + Object.entries(by).map(([k, v]) => `${v} ${tx(k).toLowerCase()}`).join(", ") + "." };
    }
    if (has(q, ["booking", "session"])) {
      const up = bookings.filter((b) => daysFrom(b.starts_at) >= 0).length;
      return { text: txn(bookings.length, "{n} booking", "{n} bookings") + tx(", {up} still to come.", { up }) };
    }
  }

  // A client by name: "what does Tara owe?", "tell me about Kemi"
  const named = clients.find((c) => { const f = first(c.name).toLowerCase(); return f.length > 2 && new RegExp(`\\b${f.replace(/[^a-z]/g, "")}\\b`).test(q); });
  if (named && !has(q, ["draft", "reply", "remind", "nudge"])) {
    const ps = projects.filter((p) => p.client_id === named.id);
    const owe = invoices.filter((i) => i.client_id === named.id && i.status === "sent");
    const nextB = bookings.filter((b) => b.client_id === named.id && daysFrom(b.starts_at) >= 0).sort((a, b) => (a.starts_at < b.starts_at ? -1 : 1))[0];
    const gs = galleries.filter((g) => g.client_id === named.id);
    const lines = [`${named.name}${named.city ? " · " + named.city : ""}`];
    lines.push(ps.length ? tx("Projects: {list}", { list: ps.map((p) => `${p.title} (${tx(STAGE_NAMES[p.stage] || p.stage)})`).join(", ") }) : tx("No projects yet."));
    lines.push(owe.length ? tx("Owes {amount}", { amount: list(totals(owe)) }) + (owe.some((i) => invState(i).k === "Overdue") ? " · " + tx("some of it is late") : "") : tx("Nothing owed right now."));
    if (nextB) lines.push(tx("Next session: {when}, {title}", { when: fday(nextB.starts_at), title: nextB.title }));
    if (gs.length) lines.push(tx("Galleries: {list}", { list: gs.map((g) => g.title).join(", ") }));
    const late = owe.filter((i) => ["Overdue", "Due soon"].includes(invState(i).k));
    return { text: lines.join("\n"), drafts: late.length ? late.map(nudgeDraft) : undefined };
  }

  // Money owed
  if (has(q, ["owe", "owed", "outstanding", "unpaid", "balance", "who hasn't paid", "late", "overdue", "chase", "nudge", "remind"])) {
    if (!open.length) return { text: tx("Nobody owes you anything right now. Every sent invoice is paid."), mood: "paid" };
    const parts = [tx("{amount} across {n} invoices.", { amount: list(totals(open)), n: open.length })];
    late.forEach((i) => parts.push(tx("{name}'s ({amount}) is {n} days late.", { name: first(client(i.client_id).name), amount: money(i.amount, i.currency), n: invState(i).late })));
    soon.forEach((i) => parts.push(tx("{name}'s ({amount}) is due soon.", { name: first(client(i.client_id).name), amount: money(i.amount, i.currency) })));
    const targets = [...late, ...soon];
    if (!targets.length) return { text: parts.join(" ") + " " + tx("Nothing is late yet.") };
    const wantsDraft = has(q, ["nudge", "remind", "chase", "draft"]);
    return {
      text: parts.join(" ") + (wantsDraft ? "" : " " + tx("Want me to draft friendly nudges?")),
      drafts: wantsDraft ? targets.map(nudgeDraft) : undefined,
      chips: wantsDraft ? undefined : ["Draft the nudges"],
    };
  }
  if (has(q, ["draft the nudges", "draft nudges"])) return answer("nudge", d);

  // This week
  if (has(q, ["week", "schedule", "coming up", "shoot", "session", "booked", "diary", "calendar"])) {
    const up = bookings.filter((b) => daysFrom(b.starts_at) >= 0 && daysFrom(b.starts_at) <= 7).sort((a, b) => (a.starts_at < b.starts_at ? -1 : 1));
    if (!up.length) return { text: tx("Nothing booked in the next 7 days. A good week to edit, or to follow up on leads."), mood: "sleep" };
    return { text: txn(up.length, "{n} session this week:", "{n} sessions this week:") + "\n" + up.map((b) => `• ${fday(b.starts_at)}, ${ftime(b.starts_at)} · ${b.title} (${first(client(b.client_id).name)})`).join("\n") };
  }

  // Contracts
  if (has(q, ["sign", "contract", "unsigned"])) {
    const un = projects.filter((p) => p.stage !== "inquiry" && p.stage !== "delivered" && !p.contract_signed);
    if (!un.length) return { text: tx("Every booked project has a signed contract.") };
    return { text: tx("Not signed yet:") + "\n" + un.map((p) => `• ${client(p.client_id).name} · ${p.title} (${fday(p.session_date)})`).join("\n") + "\n" + tx("Open a project and tap Share link to resend it.") };
  }

  // Income / profit
  if (has(q, ["made", "make", "earn", "income", "profit", "spent", "spend", "expense", "paid this", "revenue"])) {
    const cur = studio.home_currency;
    const s = summary({ invoices, expenses, subscriptions }, "month", cur);
    return { text: tx("This month: {inc} paid in, {out} spent, so you kept {profit}.", { inc: money(s.income, cur), out: money(s.spent, cur), profit: money(s.profit, cur) }) + (s.subsCount ? " " + tx("Your {n} subscriptions cost about {amt} a month.", { n: s.subsCount, amt: money(s.subsMonthly, cur) }) : ""), mood: s.profit > 0 ? "paid" : "think" };
  }

  // Inbox
  if (has(q, ["reply", "message", "inbox", "dm", "respond"])) {
    const last = [...messages].filter((m) => m.from_client).sort((a, b) => (a.created_at < b.created_at ? 1 : -1))[0];
    if (!last) return { text: tx("No client messages yet.") };
    const c = client(last.client_id);
    return {
      text: tx("{name} wrote: \"{body}\"", { name: c.name, body: last.body.length > 140 ? last.body.slice(0, 140) + "…" : last.body }) + "\n" + tx("Here's a reply in your voice:"),
      drafts: [{ to: c.name, phone: c.phone, email: c.email, subject: tx("Re: your message"), text: draftReply({ name: first(c.name), ...tone }) }],
    };
  }

  // Leads
  if (has(q, ["lead", "inquir", "enquir", "new client"])) {
    const inq = projects.filter((p) => p.stage === "inquiry");
    if (!inq.length) return { text: tx("No open inquiries right now.") };
    return { text: txn(inq.length, "{n} inquiry waiting for a quote:", "{n} inquiries waiting for a quote:") + "\n" + inq.map((p) => `• ${client(p.client_id).name} · ${p.title}`).join("\n") };
  }

  if (has(q, ["hello", "hi ", "hey", "good morning"])) return { text: tx("Hi {name}! Ask me about money, your week, contracts or messages.", { name: String(studio.owner_first_name || "").split(" ")[0] }), mood: "hello" };

  return { text: tx("I'm still learning that one. Right now I can answer from your own data: money owed, your week, contracts, galleries, clients, projects, what you made this month, and replies to clients. You can also ask about a client by name. Try one of these:"), chips: SUGGESTIONS, mood: "think" };
}
