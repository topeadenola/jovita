import { useData } from "./data";
import { useToast } from "../components/ui";
import { addDays, first, money, portalUrl } from "./format";
import { tx } from "./i18n";
import { celebratePaid } from "../components/PaidMoment";
import { sendEmail } from "./email";

async function copy(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
}

// One place for the quick actions used on Today, Projects and Money.
// Invoices, reminders, contracts and galleries are emailed to the client (Brevo). If that can't happen
// (no client email, email not set up yet), we copy the client's link so it can be sent by hand.
export function useActions() {
  const { update, insert, client, project, galleries, invoices, studio } = useData();
  const toast = useToast();

  const shareLink = async (p, what) => {
    const ok = await copy(portalUrl(p.portal_token));
    toast(ok ? tx("{what} link copied. Paste it to {first} in a message or email.", {
      what: what,
      first: first(client(p.client_id).name)
    }) : tx("Copy this link: {portalUrl}", {
      portalUrl: portalUrl(p.portal_token)
    }));
  };

  const emailOrShare = async (kind, ids, p, what, clientId) => {
    const name = first(client(clientId ?? p?.client_id)?.name);
    const r = await sendEmail(kind, ids);
    if (r.ok) return toast(tx("{what} emailed to {first}", { what, first: name }), true);
    if (p) { await copy(portalUrl(p.portal_token)); return toast(tx("{reason} The link is copied so you can send it yourself.", { reason: r.reason })); }
    return toast(r.reason);
  };

  async function projectAction(p, a, opts = {}) {
    try {
      if (a === "quote") {
        // Open a draft quote you can check and send. The job is booked when the client accepts it.
        const draft = invoices.find((i) => i.project_id === p.id && i.kind === "quote" && i.status === "draft");
        if (draft) return opts.open?.(draft.id);
        const uid = () => Math.random().toString(36).slice(2, 9);
        const q = await insert("invoices", {
          kind: "quote", client_id: p.client_id, project_id: p.id, label: p.title, amount: Number(p.amount) || 0, currency: p.currency || studio.home_currency,
          due_date: addDays(14), status: "draft", items: [{ id: uid(), name: p.title, description: "", qty: 1, price: Number(p.amount) || 0 }],
          methods: ["transfer", "paystack", "flutterwave", "stripe", "paypal"].filter((m) => studio["pay_" + m]),
        });
        if (opts.open) return opts.open(q.id);
        return toast(tx("Draft quote #{number} created. Open it in Money to send.", { number: q.number }));
      }
      if (a === "contract") return emailOrShare("contract", { project_id: p.id }, p, tx("Contract"));
      if (a === "deposit") return shareLink(p, tx("Payment"));
      if (a === "advance") {
        const next = p.stage === "booked" ? "shooting" : "editing";
        await update("projects", p.id, { stage: next });
        return toast(next === "editing" ? tx("Nice shoot! Moved to Editing.") : tx("Moved to Shooting."));
      }
      if (a === "deliver") {
        await update("projects", p.id, { stage: "delivered", gallery_delivered: true });
        const g = galleries.find((x) => x.project_id === p.id);
        if (g) {
          await update("galleries", g.id, { status: "delivered", expires_on: addDays(30) });
          const r = await sendEmail("gallery", { gallery_id: g.id });
          if (!r.ok) return toast(tx("Gallery delivered. {reason}", { reason: r.reason }));
        }
        return toast(tx("Gallery delivered to {first}", {
          first: first(client(p.client_id).name)
        }), true);
      }
      if (a === "review") return shareLink(p, tx("Review request"));
    } catch (e) { toast(e.message); }
  }

  async function invoiceAction(i, a, opts = {}) {
    try {
      if (a === "markpaid") {
        await update("invoices", i.id, { status: "paid", paid_at: new Date().toISOString() });
        if (i.project_id) await update("projects", i.project_id, { deposit_paid: true });
        await update("clients", i.client_id, { status: "client" });
        return celebratePaid({ name: first(client(i.client_id).name), amount: money(i.amount, i.currency), label: i.label, clientId: i.client_id });
      }
      if (a === "send") {
        const quote = i.kind === "quote";
        await update("invoices", i.id, { status: "sent" });
        if (quote && i.project_id) await update("projects", i.project_id, { amount: Number(i.amount) || 0 }).catch(() => {});
        const r = await sendEmail(quote ? "quote" : "invoice", { invoice_id: i.id, copy_me: opts.copy_me ?? undefined });
        if (r.ok) return toast(quote ? tx("Quote #{number} emailed to {first}", { number: i.number, first: first(client(i.client_id).name) }) : tx("Invoice #{number} emailed to {first}", { number: i.number, first: first(client(i.client_id).name) }), true);
        return toast(tx("Invoice #{number} is ready to pay in {first}'s portal", {
          number: i.number,
          first: first(client(i.client_id).name)
        }) + " " + r.reason);
      }
      if (a === "nudge") {
        const p = i.project_id && project(i.project_id);
        return emailOrShare("payment_reminder", { invoice_id: i.id, copy_me: opts.copy_me ?? undefined }, p || null, tx("Payment reminder"), i.client_id);
      }
      if (a === "reminders") {
        const on = !(i.reminders_on ?? true);
        await update("invoices", i.id, { reminders_on: on });
        return toast(on ? tx("Reminders on for #{number}", { number: i.number }) : tx("Reminders off for #{number}", { number: i.number }));
      }
      if (a === "cancel") { await update("invoices", i.id, { status: "cancelled" }); return toast(tx("Invoice #{number} cancelled", {
        number: i.number
      })); }
    } catch (e) { toast(e.message); }
  }

  return { projectAction, invoiceAction, invoices };
}
