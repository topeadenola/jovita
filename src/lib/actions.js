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
  const { update, client, project, galleries, invoices } = useData();
  const toast = useToast();

  const shareLink = async (p, what) => {
    const ok = await copy(portalUrl(p.portal_token));
    toast(ok ? tx("{what} link copied. Paste it to {first} on WhatsApp or email.", {
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

  async function projectAction(p, a) {
    try {
      if (a === "quote") { await update("projects", p.id, { stage: "booked" }); await update("clients", p.client_id, { status: "client" }); return shareLink(p, tx("Quote")); }
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

  async function invoiceAction(i, a) {
    try {
      if (a === "markpaid") {
        await update("invoices", i.id, { status: "paid", paid_at: new Date().toISOString() });
        if (i.project_id) await update("projects", i.project_id, { deposit_paid: true });
        await update("clients", i.client_id, { status: "client" });
        return celebratePaid({ name: first(client(i.client_id).name), amount: money(i.amount, i.currency), label: i.label, clientId: i.client_id });
      }
      if (a === "send") {
        await update("invoices", i.id, { status: "sent" });
        const r = await sendEmail("invoice", { invoice_id: i.id });
        if (r.ok) return toast(tx("Invoice #{number} emailed to {first}", { number: i.number, first: first(client(i.client_id).name) }), true);
        return toast(tx("Invoice #{number} is ready to pay in {first}'s portal", {
          number: i.number,
          first: first(client(i.client_id).name)
        }) + " " + r.reason);
      }
      if (a === "nudge") {
        const p = i.project_id && project(i.project_id);
        return emailOrShare("payment_reminder", { invoice_id: i.id }, p || null, tx("Payment reminder"), i.client_id);
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
