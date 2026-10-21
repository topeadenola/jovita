// Ask Jovita can do things, not just answer. Rules only (no AI service).
// Creating drafts (a client, a project, a draft invoice, a draft gallery) happens straight away because it's easy to undo.
// Anything touching money or a client's inbox (mark paid, send) asks you to confirm first.
import { addDays, first, invState, money, PROJECT_TYPES } from "./format";
import { tx } from "./i18n";

const has = (q, words) => words.some((w) => q.includes(w));
const STOP = new Set(["a", "an", "the", "my", "me", "her", "him", "them", "new", "client", "customer", "she", "he", "they", "who", "is", "was", "for", "with", "of", "worth", "at", "and", "please", "pls", "invoice", "project", "gallery", "today", "tomorrow", "now", "it", "this", "that", "as", "to", "on", "in", "about", "amount", "called", "named", "shoot", "session", "wedding", "newborn", "portrait", "birthday", "maternity", "family", "event", "lead", "contact"]);
const uid = () => Math.random().toString(36).slice(2, 9);
const cap = (w) => w.charAt(0).toUpperCase() + w.slice(1);

// "Tara", "Tara Smith", "tara smith-ojo"
export function nameIn(raw, keys = ["for", "to", "called", "named", "client", "bill"]) {
  const words = raw.replace(/[.,!?;:()"]/g, " , ").split(/\s+/).filter(Boolean);
  for (let i = 0; i < words.length - 1; i++) {
    if (!keys.includes(words[i].toLowerCase())) continue;
    const out = [];
    for (let j = i + 1; j < words.length && out.length < 3; j++) {
      const w = words[j];
      if (w === ",") { if (out.length) break; continue; }
      if (STOP.has(w.toLowerCase())) { if (out.length) break; continue; }
      if (!/^[\p{L}'’-]{2,}$/u.test(w)) break;
      out.push(cap(w));
    }
    if (out.length) return out.join(" ");
  }
  return "";
}

export function findClient(name, clients) {
  if (!name) return null;
  const n = name.toLowerCase();
  return clients.find((c) => c.name.toLowerCase() === n)
    || clients.find((c) => c.name.toLowerCase().startsWith(n + " ") || first(c.name).toLowerCase() === n.split(" ")[0] && n.split(" ").length === 1)
    || clients.find((c) => c.name.toLowerCase().includes(n));
}

// 250k, 1.2m, ₦250,000, £800, 800 pounds
function amountIn(raw) {
  const m = raw.match(/(?:₦|£|\$|€|ngn|gbp|usd|eur|cfa)?\s?(\d[\d,]*(?:\.\d+)?)\s?(k|m|thousand|million)?\b\s?(naira|pounds?|dollars?|euros?|cfa)?/i);
  if (!m) return null;
  let v = parseFloat(m[1].replace(/,/g, ""));
  if (!v) return null;
  const mult = (m[2] || "").toLowerCase();
  if (mult === "k" || mult === "thousand") v *= 1000;
  if (mult === "m" || mult === "million") v *= 1e6;
  const sym = (m[0].match(/₦|£|\$|€|ngn|gbp|usd|eur|cfa|naira|pound|dollar|euro/i) || [""])[0].toLowerCase();
  const cur = { "₦": "NGN", ngn: "NGN", naira: "NGN", "£": "GBP", gbp: "GBP", pound: "GBP", $: "USD", usd: "USD", dollar: "USD", "€": "EUR", eur: "EUR", euro: "EUR", cfa: "XOF" }[sym];
  // Ignore small numbers that are probably days or counts unless there's a currency or k/m
  if (!cur && !mult && v < 1000) return null;
  return { value: v, currency: cur };
}
function typeIn(q) {
  const t = PROJECT_TYPES.find((x) => q.includes(x.toLowerCase()));
  if (t) return t;
  if (has(q, ["newborn", "maternity", "headshot", "birthday", "graduation"])) return "Portrait";
  if (has(q, ["engagement", "pre-wedding", "prewedding"])) return "Wedding";
  return "";
}
function labelIn(q) {
  const m = q.match(/\b(newborn|maternity|wedding|engagement|pre-wedding|birthday|family|portrait|headshot|graduation|brand|product|event|makeup|styling)\b(\s(shoot|session|photos|film|video))?/);
  return m ? cap(m[0]) : "";
}

const NAV = [
  [["invoice list", "invoices", "payments page"], "/money?tab=invoices", "Invoices"], [["money"], "/money", "Money"], [["inbox", "messages"], "/inbox", "Inbox"], [["client list", "clients page", "clients"], "/clients", "Clients"],
  [["projects"], "/projects", "Projects"], [["bookings", "calendar"], "/bookings", "Bookings"], [["accounting", "expenses", "tax"], "/money?tab=expenses", "Expenses"],
  [["galleries"], "/galleries", "Galleries"], [["templates"], "/settings?tab=templates", "Templates"], [["settings"], "/settings", "Settings"], [["logo"], "/settings", "Settings"],
  [["today", "home", "dashboard"], "/", "Today"],
];

/**
 * Try to turn the message into an action.
 * ctx: { data, ui: { nav, openInvoice, openGallery, openProject }, pending }
 * Returns null (not a command) or { text, buttons?, chips?, pending?, run? } where run() does the work and returns a follow-up reply.
 */
export function command(raw, ctx) {
  const { data, pending } = ctx;
  const { clients = [], invoices = [], projects = [], galleries = [], studio } = data;
  const q = ` ${String(raw || "").toLowerCase().trim()} `;
  const isNew = has(q, [" new client", "new customer", "she is new", "he is new", "they are new", "first time", "not a client yet", "add her", "add him", "add them", " is a new "]);

  // Follow-up to a question Jovita just asked
  if (pending?.kind === "who") {
    if (has(q, [" cancel ", " never mind", " nevermind", " no "])) return { text: tx("No problem. What else can I help with?") };
    const name = nameIn("for " + raw) || cap(raw.trim().split(/\s+/)[0] || "");
    return doFor(pending.what, name, { ...pending.opts, isNew: isNew || pending.opts?.isNew }, ctx);
  }

  // Just "create" / "new" / "add"
  if (/^\s*(create|new|add|make|start)\s*(something|one|a new one)?\s*$/.test(q)) {
    return { text: tx("Sure. What should I create?"), chips: ["A new invoice", "A new client", "A new project", "A new gallery"] };
  }

  // Reminders and replies are drafted by the answer rules, not here
  if (has(q, ["remind", "nudge", "chase", "reply", "follow up", "follow-up", "how many", "how much"])) return null;

  // "Send Tara's invoice" → send her draft (asks first)
  if (has(q, [" send "]) && has(q, ["invoice"])) {
    const c = findClient(nameIn(raw, ["to", "for", "send"]) || nameIn("for " + raw.replace(/^.*?send\s+/i, "").replace(/['’]s\b/, "")), clients);
    const drafts = c ? invoices.filter((i) => i.client_id === c.id && i.status === "draft") : [];
    if (c && drafts.length) {
      const i = drafts[0];
      return { text: tx("Send invoice #{number} ({amount}) to {name}? It goes to their client page, where they can pay.", { number: i.number, amount: money(i.amount, i.currency), name: first(c.name) }),
        buttons: [{ label: tx("Yes, send it"), primary: true, run: async () => { await ctx.ui.sendInvoice(i); return { text: tx("Sent. Invoice #{number} is waiting in {name}'s client page. We've emailed them the link.", { number: i.number, name: first(c.name) }), chips: [tx("Remind {name}", { name: first(c.name) })] }; } },
          { label: tx("Open it first"), run: () => { ctx.ui.openInvoice(i.id); return null; } }] };
    }
  }

  const verb = has(q, ["create", "make", "new ", "raise", "prepare", "draft", "start", "generate", "issue", "set up", "setup", "open a", "do an", "do a", "add", "book", "need a", "need an", "want a", "want an", "can you", "please"]);

  // Invoice
  if ((has(q, ["invoice", "bill "]) && (verb || has(q, [" invoice for", " invoice to", "bill "]))) && !has(q, ["how many", "owe", "paid?", "unpaid", "overdue"])) {
    const name = nameIn(raw);
    return doFor("invoice", name, { isNew, amount: amountIn(raw), label: labelIn(q), type: typeIn(q) }, ctx);
  }
  // Gallery
  if (has(q, ["gallery", "galleries", "album"]) && verb && !has(q, ["how many"])) {
    return doFor("gallery", nameIn(raw), { isNew, label: labelIn(q) }, ctx);
  }
  // Project / booking a job
  if ((has(q, ["project", " job", " shoot ", "session for"]) && verb) || /\bbook (a|an)\b/.test(q)) {
    return doFor("project", nameIn(raw), { isNew, amount: amountIn(raw), label: labelIn(q), type: typeIn(q) }, ctx);
  }
  // Client
  if (has(q, ["client", "customer", "contact", "lead"]) && has(q, ["add", "create", "new", "save", "register"]) && !has(q, ["how many"])) {
    const name = nameIn(raw, ["for", "called", "named", "client", "customer", "contact", "lead", "add"]);
    const email = (raw.match(/[^\s@,;]+@[^\s@,;]+\.[a-z]{2,}/i) || [""])[0];
    const phone = (raw.match(/\+?\d[\d\s-]{7,}\d/) || [""])[0].trim();
    const status = has(q, ["lead", "enquir", "inquir"]) ? "lead" : "client";
    if (!name) return { text: tx("What's the new client's name?"), pending: { kind: "who", what: "client", opts: { email, phone, status, isNew: true } } };
    return doFor("client", name, { email, phone, status, isNew: true }, ctx);
  }
  // Mark paid (asks first)
  if (has(q, ["mark", "got paid", "has paid", "paid me", "received payment", "payment received", "she paid", "he paid", "they paid"]) && has(q, ["paid", "payment"])) {
    const name = nameIn(raw, ["for", "from", "mark", "by"]) || nameIn("for " + raw.replace(/^(mark|got|received)\s+/i, ""));
    const c = findClient(name, clients);
    if (!c) return { text: name ? tx("I couldn't find {name} in your clients. Who paid?", { name }) : tx("Who paid you?"), chips: clients.slice(0, 4).map((x) => x.name) , pending: { kind: "who", what: "paid", opts: {} } };
    return markPaid(c, ctx);
  }
  // Go somewhere
  if (has(q, ["go to", "open ", "take me", "show me the", "show the", "navigate"])) {
    const hit = NAV.find(([words]) => has(q, words));
    if (hit) {
      return { text: tx("Opening {page}.", { page: tx(hit[2]) }), run: () => { ctx.ui.nav(hit[1]); return null; } };
    }
  }
  return null;
}

function markPaid(c, ctx) {
  const open = (ctx.data.invoices || []).filter((i) => i.client_id === c.id && i.status === "sent");
  if (!open.length) return { text: tx("{name} has no unpaid invoices.", { name: c.name }) };
  return {
    text: open.length === 1 ? tx("Mark invoice #{number} ({amount}) from {name} as paid?", { number: open[0].number, amount: money(open[0].amount, open[0].currency), name: first(c.name) })
      : tx("{name} has {n} unpaid invoices. Which one was paid?", { name: first(c.name), n: open.length }),
    buttons: open.map((i) => ({
      label: open.length === 1 ? tx("Yes, mark as paid") : `#${i.number} · ${money(i.amount, i.currency)}`, primary: true,
      run: async () => { await ctx.ui.markPaid(i); return { text: tx("Done. Invoice #{number} is marked paid.", { number: i.number }), mood: "paid" }; },
    })).concat([{ label: tx("Not yet"), run: async () => ({ text: tx("Okay, nothing changed.") }) }]),
  };
}

// Do something for a named client, asking for the name or offering to add them when needed
function doFor(what, name, opts, ctx) {
  const { clients = [] } = ctx.data;
  const WHAT = { invoice: tx("an invoice"), gallery: tx("a gallery"), project: tx("a project"), client: tx("a client"), paid: "" };
  if (what === "paid") { const c = findClient(name, clients); return c ? markPaid(c, ctx) : { text: tx("I couldn't find {name}. Check the spelling?", { name }) }; }
  if (!name) {
    return { text: tx("Who is {what} for?", { what: WHAT[what] }), chips: clients.slice(0, 4).map((c) => c.name), pending: { kind: "who", what, opts } };
  }
  if (what === "client") {
    const dupe = findClient(name, clients);
    if (dupe && dupe.name.toLowerCase() === name.toLowerCase()) return { text: tx("{name} is already in your clients.", { name: dupe.name }), buttons: [{ label: tx("Open clients"), run: () => { ctx.ui.nav("/clients"); return null; } }] };
    return { text: tx("Adding {name} to your clients…", { name }), run: async () => {
      await ctx.ui.insert("clients", { name, email: opts.email || "", phone: opts.phone || "", city: "", status: opts.status || "client" });
      return { text: tx("Done. {name} is now in your clients.", { name }) + (opts.email || opts.phone ? "" : "\n" + tx("Add their email in Clients so I can draft messages to them.")), chips: [tx("Create an invoice for {name}", { name: first(name) }), tx("Create a project for {name}", { name: first(name) })] };
    } };
  }
  const c = findClient(name, clients);
  if (!c && !opts.isNew) {
    return {
      text: tx("I couldn't find {name} in your clients. Add {name} as a new client and create {what}?", { name, what: WHAT[what] }),
      buttons: [
        { label: tx("Yes, add {name}", { name: first(name) }), primary: true, run: async () => create(what, null, name, opts, ctx) },
        { label: tx("No"), run: async () => ({ text: tx("Okay. Tell me the client's name as it's saved, or pick one:"), chips: clients.slice(0, 4).map((x) => x.name), pending: { kind: "who", what, opts } }) },
      ],
    };
  }
  if (c && opts.isNew && c.name.toLowerCase() !== name.toLowerCase()) {
    return {
      text: tx("You already have {existing} in your clients. Is it for them, or a new client called {name}?", { existing: c.name, name }),
      buttons: [
        { label: tx("Use {existing}", { existing: c.name }), primary: true, run: async () => create(what, c, name, opts, ctx) },
        { label: tx("Add new client {name}", { name }), run: async () => create(what, null, name, opts, ctx) },
      ],
    };
  }
  return { text: c ? tx("On it: {what} for {name}…", { what: WHAT[what], name: c.name }) : tx("On it: adding {name} as a new client, then {what}…", { name, what: WHAT[what] }), run: async () => create(what, c, name, opts, ctx) };
}

async function create(what, c, name, opts, ctx) {
  const { studio, projects = [], templates = [] } = ctx.data;
  const steps = [];
  if (!c) {
    c = await ctx.ui.insert("clients", { name, email: "", phone: "", city: "", status: "client" });
    steps.push(tx("Added {name} to your clients.", { name }));
  }
  const fname = first(c.name);
  if (what === "invoice") {
    // An invoice means you're working with them, so it always belongs to a project (made now if there's no open one)
    let p = projects.filter((x) => x.client_id === c.id && x.stage !== "delivered").sort((a, b) => (a.created_at < b.created_at ? 1 : -1))[0];
    if (!p) {
      const type = PROJECT_TYPES.find((t) => t.toLowerCase() === String(opts.type || "").toLowerCase()) || "Portrait";
      p = await ctx.ui.insert("projects", { client_id: c.id, title: opts.label || tx("{type} session", { type: tx(type) }), type, stage: "booked", amount: opts.amount?.value || 0,
        currency: opts.currency || opts.amount?.currency || studio.home_currency, session_date: /^\d{4}-\d{2}-\d{2}$/.test(opts.session_date || "") ? opts.session_date : null });
      steps.push(tx("Created the project \"{title}\" for {name}.", { title: p.title, name: fname }));
    }
    const pkg = opts.label && templates.find((t) => t.kind === "invoice" && t.name.toLowerCase().includes(opts.label.toLowerCase().split(" ")[0]));
    const price = opts.amount?.value ?? (pkg ? null : Number(p?.amount) || 0);
    const items = opts.items?.length ? opts.items.map((it) => ({ id: uid(), name: it.name || "", description: it.description || "", qty: Number(it.qty ?? 1) || 1, price: Number(it.price) || 0 }))
      : pkg && !opts.amount ?(pkg.items || []).map((it) => ({ id: uid(), name: it.name || "", description: it.description || "", qty: it.qty ?? 1, price: it.price ?? 0 }))
      : [{ id: uid(), name: opts.label || p?.title || "", description: "", qty: 1, price: price || 0 }];
    const total = items.reduce((s, it) => s + Number(it.qty || 0) * Number(it.price || 0), 0);
    const inv = await ctx.ui.insert("invoices", {
      client_id: c.id, project_id: p?.id || null, label: opts.label || pkg?.name || p?.title || tx("Invoice"), amount: total,
      currency: opts.currency || opts.amount?.currency || pkg?.currency || p?.currency || studio.home_currency, due_date: addDays(14), status: "draft", items,
      methods: ["transfer", "paystack", "flutterwave", "stripe", "paypal"].filter((m) => studio["pay_" + m]),
    });
    ctx.ui.openInvoice(inv.id);
    steps.push(tx(opts.items?.length ? "Created draft invoice #{number} for {name}{amount}. It's open now: check it, then press Send." : "Created draft invoice #{number} for {name}{amount}. It's open now: add the items, then press Send.", { number: inv.number || "", name: fname, amount: total ? " (" + money(total, inv.currency) + ")" : "" }));
    return { text: steps.join("\n"), mood: "happy" };
  }
  if (what === "project") {
    const title = opts.label || tx("{type} session", { type: tx(opts.type || "Portrait") });
    const type = PROJECT_TYPES.find((t) => t.toLowerCase() === String(opts.type || "").toLowerCase()) || "Portrait";
    const p = await ctx.ui.insert("projects", { client_id: c.id, title, type, stage: opts.session_date ? "booked" : "inquiry", amount: opts.amount?.value || 0, currency: opts.currency || opts.amount?.currency || studio.home_currency, session_date: /^\d{4}-\d{2}-\d{2}$/.test(opts.session_date || "") ? opts.session_date : null });
    ctx.ui.openProject(p.id);
    steps.push(tx("Created the project \"{title}\" for {name}. Add the date and price on the project.", { title, name: fname }));
    return { text: steps.join("\n"), chips: [tx("Create an invoice for {name}", { name: fname })] };
  }
  if (what === "gallery") {
    let p = projects.filter((x) => x.client_id === c.id).sort((a, b) => (a.created_at < b.created_at ? 1 : -1))[0];
    if (!p) {
      p = await ctx.ui.insert("projects", { client_id: c.id, title: opts.label || tx("Photo session"), type: "Portrait", stage: "editing", amount: 0, currency: studio.home_currency, session_date: null });
      steps.push(tx("Created a project for {name}.", { name: fname }));
    }
    const g = await ctx.ui.insert("galleries", { project_id: p.id, client_id: c.id, title: opts.label || p.title, status: "draft", event_date: p.session_date || null });
    ctx.ui.openGallery(g.id);
    steps.push(tx("Created the gallery \"{title}\". It's open now: drop in the photos, then publish and invite {name}.", { title: g.title, name: fname }));
    return { text: steps.join("\n") };
  }
  return { text: steps.join("\n") };
}

export const isLate = (i) => invState(i).k === "Overdue";

// The brain suggests actions; each becomes a draft or a button the person taps.
const PAGES = { today: "/", clients: "/clients", projects: "/projects", money: "/money", inbox: "/inbox", bookings: "/bookings", galleries: "/galleries", accounting: "/money", expenses: "/money?tab=expenses", invoices: "/money?tab=invoices", templates: "/settings?tab=templates", settings: "/settings" };
const PAGE_NAMES = { today: "Today", clients: "Clients", projects: "Projects", money: "Money", inbox: "Inbox", bookings: "Bookings", galleries: "Galleries", accounting: "Accounting", templates: "Templates", settings: "Settings" };
export function fromBrain(actions = [], ctx) {
  const { clients = [], invoices = [] } = ctx.data;
  const drafts = [];
  const buttons = [];
  const who = (a) => clients.find((c) => c.id === a.client_id) || findClient(a.client_name, clients);
  for (const { tool, input: a = {} } of actions) {
    if (tool === "draft_message") {
      const c = clients.find((x) => x.id === a.client_id);
      if (c && a.text) drafts.push({ to: c.name, phone: a.channel === "email" ? "" : c.phone, email: a.channel === "whatsapp" ? "" : c.email, subject: a.subject || "", text: a.text });
    } else if (tool === "create_client" && a.name) {
      buttons.push({ label: tx("Add {name}", { name: a.name }), primary: true, run: async () => { const r = doFor("client", a.name, { email: a.email || "", phone: a.phone || "", status: a.status || "client", isNew: true }, ctx); return r.run ? r.run() : r; } });
    } else if (["create_invoice", "create_project", "create_gallery"].includes(tool)) {
      const what = tool.slice(7);
      const c = who(a);
      const name = c?.name || a.client_name;
      if (!name) continue;
      const opts = { label: a.label || a.title || "", items: a.items, currency: a.currency, type: a.type, session_date: a.session_date, amount: a.amount ? { value: Number(a.amount), currency: a.currency } : null };
      const L = { invoice: "Create the draft invoice", project: "Create the project", gallery: "Create the gallery" }[what];
      buttons.push({ label: c ? tx(L) : tx("Add {name} and continue", { name: first(name) }), primary: true, run: async () => create(what, c || null, name, opts, ctx) });
    } else if (tool === "send_invoice" || tool === "mark_paid") {
      const i = invoices.find((x) => x.id === a.invoice_id);
      if (!i) continue;
      if (tool === "send_invoice" && i.status === "draft") buttons.push({ label: tx("Send invoice #{number}", { number: i.number }), primary: true, run: async () => { await ctx.ui.sendInvoice(i); return { text: tx("Sent. Invoice #{number} is on the client's page.", { number: i.number }) }; } });
      if (tool === "mark_paid" && i.status === "sent") buttons.push({ label: tx("Mark #{number} as paid", { number: i.number }), primary: true, run: async () => { await ctx.ui.markPaid(i); return { text: tx("Done. Invoice #{number} is marked paid.", { number: i.number }), mood: "paid" }; } });
    } else if (tool === "open_page" && PAGES[a.page]) {
      buttons.push({ label: tx("Open {page}", { page: tx(PAGE_NAMES[a.page]) }), run: () => { ctx.ui.nav(PAGES[a.page]); return null; } });
    }
  }
  if (buttons.some((b) => b.primary)) buttons.push({ label: tx("Not now"), run: async () => ({ text: tx("Okay, nothing changed.") }) });
  return { drafts, buttons };
}
