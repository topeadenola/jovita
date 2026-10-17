import { Share } from "react-native";
import { useData } from "./data";
import { useToast } from "../components/ui";
import { addDays, first, money, portalUrl } from "./format";
import { tx } from "./i18n";
import { celebratePaid } from "../components/PaidMoment";

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

  async function projectAction(p, a) {
    try {
      if (a === "quote") { await update("projects", p.id, { stage: "booked" }); await update("clients", p.client_id, { status: "client" }); return shareLink(p, tx("Quote")); }
      if (a === "contract") return shareLink(p, tx("Contract"));
      if (a === "deposit") return shareLink(p, tx("Payment"));
      if (a === "advance") {
        const next = p.stage === "booked" ? "shooting" : "editing";
        await update("projects", p.id, { stage: next });
        return toast(next === "editing" ? tx("Nice shoot! Moved to Editing.") : tx("Moved to Shooting."));
      }
      if (a === "deliver") {
        await update("projects", p.id, { stage: "delivered", gallery_delivered: true });
        const g = galleries.find((x) => x.project_id === p.id);
        if (g) await update("galleries", g.id, { status: "delivered", expires_on: addDays(30) });
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
      if (a === "send") { await update("invoices", i.id, { status: "sent" }); return toast(tx("Invoice #{number} is ready in the client's portal", {
        number: i.number
      })); }
      if (a === "reminders") {
        const on = !(i.reminders_on ?? true);
        await update("invoices", i.id, { reminders_on: on });
        return toast(on ? tx("Reminders on for #{number}", { number: i.number }) : tx("Reminders off for #{number}", { number: i.number }));
      }
      if (a === "nudge") {
        const p = i.project_id && project(i.project_id);
        if (p) return shareLink(p, tx("Payment reminder"));
        return toast(tx("Link this invoice to a project to share a payment link."));
      }
    } catch (e) { toast(e.message); }
  }

  return { projectAction, invoiceAction, shareLink };
}
