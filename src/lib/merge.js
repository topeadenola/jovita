import { fday, first, money, fdate, portalUrl } from "./format";

// Merge fields creatives can drop into templates
export const FIELDS = [
  ["client_name", "Client name"],
  ["client_first_name", "Client first name"],
  ["studio_name", "Studio name"],
  ["project_title", "Project title"],
  ["project_type", "Project type"],
  ["session_date", "Session date"],
  ["project_amount", "Project fee"],
  ["portal_link", "Client portal link"],
  ["invoice_number", "Invoice number"],
  ["invoice_amount", "Invoice amount"],
  ["invoice_due", "Invoice due date"],
];

export function values({ studio, client, project, invoice }) {
  return {
    client_name: client?.name || "Adaeze Okafor",
    client_first_name: first(client?.name || "Adaeze"),
    studio_name: studio?.name || "Your studio",
    project_title: project?.title || "Maternity shoot",
    project_type: (project?.type || "portrait").toLowerCase(),
    session_date: project?.session_date ? fday(project.session_date) : "Sat 24 Oct",
    project_amount: project ? money(project.amount, project.currency) : "₦450,000",
    portal_link: project ? portalUrl(project.portal_token) : "https://app.getjovita.com/p/your-client-link",
    invoice_number: invoice ? `#${invoice.number}` : "#1001",
    invoice_amount: invoice ? money(invoice.amount, invoice.currency) : "₦225,000",
    invoice_due: invoice ? fdate(invoice.due_date) : "24 Oct",
  };
}

export const fill = (text = "", vals) => text.replace(/\{(\w+)\}/g, (m, k) => (k in vals ? vals[k] : m));
