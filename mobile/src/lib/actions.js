import { Share } from "react-native";
import { useData } from "./data";
import { useToast } from "../components/ui";
import { addDays, first, money, portalUrl } from "./format";
import { tx } from "./i18n";
import { celebratePaid } from "../components/PaidMoment";
import { sendEmail } from "./email";

// Quick actions shared by Today, Projects and Money.
// Sharing opens the phone's share sheet so you can send the client's link on WhatsApp, SMS or email.
export function useActions() {
  const { update, client, project, galleries, studio } = useData();
  const toast = useToast();

  const shareLink = async (p, what) => {
    const c = client(p.client_id);
    const url = portalUrl(p.portal_token);
    const message = {
      Quote: `Hi ${first(c.name)}! Your quote for ${p.title.toLowerCase()} is ready. You can sign and pay your deposit here: ${url}`,
      Contract: `Hi ${first(c.name)}, a gentle reminder to sign your contract for ${p.title.toLowerCase()}: ${url}`,
      Payment: `Hi ${first(c.name)}, your invoice is ready to pay here: ${url}`,
      "Payment reminder": `Hi ${first(c.name)}, just a friendly reminder that your invoice is due. You can pay here: ${url}`,
      "Review request": `Hi ${first(c.name)}, thank you for choosing ${studio.name}! Would you leave us a quick review? ${url}`,
    }[what] || url;
    try { await Share.share({ message }); } catch (e) { toast(e.message); }
  };

  // Email the client first (Brevo). If that can't happen, open the share sheet instead.
  const emailOrShare = async (kind, ids, p, what, clientId) => {
    const name = first(client(clientId ?? p?.client_id)?.name);
    const r = await sendEmail(kind, ids);
    if (r.ok) return toast(tx("{what} emailed to {first}", { what, first: name }));
    if (p) return shareLink(p, what);
    return toast(r.reason);
  };

  async function projectAction(p, a) {
    try {
      if (a === "quote") { await update("projects", p.id, { stage: "booked" }); await update("clients", p.client_id, { status: "client" }); return shareLink(p, tx("Quote")); }
      if (a === "contract") return emailOrShare("contract", { project_id: p.id }, p, "Contract");
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
        }));
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
        if (r.ok) return toast(tx("Invoice #{number} emailed to {first}", { number: i.number, first: first(client(i.client_id).name) }));
        return toast(tx("Invoice #{number} is ready in the client's portal", { number: i.number }) + " " + r.reason);
      }
      if (a === "reminders") {
        const on = !(i.reminders_on ?? true);
        await update("invoices", i.id, { reminders_on: on });
        return toast(on ? tx("Reminders on for #{number}", { number: i.number }) : tx("Reminders off for #{number}", { number: i.number }));
      }
      if (a === "nudge") {
        const p = i.project_id && project(i.project_id);
        return emailOrShare("payment_reminder", { invoice_id: i.id }, p || null, "Payment reminder", i.client_id);
      }
    } catch (e) { toast(e.message); }
  }

  return { projectAction, invoiceAction, shareLink };
}
