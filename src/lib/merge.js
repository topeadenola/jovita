import { fday, first, money, fdate, portalUrl } from "./format";

// Merge fields creatives can drop into templates
export const FIELDS = [
  ["client_name", "Client name"],
  ["client_first_name", "Client first name"],
  ["client_email", "Client email"],
  ["client_phone", "Client phone"],
  ["client_address", "Client address"],
  ["studio_name", "Studio name"],
  ["project_title", "Project title"],
  ["project_type", "Project type"],
  ["session_date", "Session date"],
  ["session_location", "Session location"],
  ["project_amount", "Project fee"],
  ["portal_link", "Client portal link"],
  ["invoice_number", "Invoice number"],
  ["invoice_amount", "Invoice amount"],
  ["invoice_due", "Invoice due date"],
  ["today", "Today's date"],
];

export function values({ studio, client, project, invoice, booking }) {
  return {
    client_name: client?.name || "Adaeze Okafor",
    client_first_name: first(client?.name || "Adaeze"),
    client_email: client ? client.email || "" : "adaeze@example.com",
    client_phone: client ? client.phone || "" : "+234 803 000 0000",
    client_address: client ? client.address || client.city || "address to be confirmed" : "12 Admiralty Way, Lekki, Lagos",
    studio_name: studio?.name || "Your studio",
    project_title: project?.title || "Maternity shoot",
    project_type: (project?.type || "portrait").toLowerCase(),
    // A real job without a date or fee yet never shows the example ones
    session_date: project?.session_date ? fday(project.session_date) : project ? "a date to be agreed" : "Sat 24 Oct",
    session_location: booking?.location || (project ? "a location to be agreed" : "Lekki, Lagos"),
    project_amount: project ? (Number(project.amount) > 0 ? money(project.amount, project.currency) : "the agreed fee") : "₦450,000",
    portal_link: project ? portalUrl(project.portal_token) : "https://app.getjovita.com/p/your-client-link",
    invoice_number: invoice ? `#${invoice.number}` : "#1001",
    invoice_amount: invoice ? money(invoice.amount, invoice.currency) : "₦225,000",
    invoice_due: invoice ? fdate(invoice.due_date) : "24 Oct",
    today: fdate(new Date().toISOString()),
  };
}

export const fill = (text = "", vals) => text.replace(/\{(\w+)\}/g, (m, k) => (k in vals ? vals[k] : m));
