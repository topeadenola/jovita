import { supabase } from "../supabase";
import { addDays } from "./format";

// Example records so a new studio can explore Jovita. All names are made up.
export async function loadSampleData(studioId) {
  const S = (rows) => rows.map((r) => ({ ...r, studio_id: studioId }));
  const ins = async (table, rows) => {
    const { data, error } = await supabase.from(table).insert(S(rows)).select();
    if (error) throw error;
    return data;
  };

  const c = await ins("clients", [
    { name: "Adaeze Okafor", email: "adaeze@example.com", phone: "+234 803 000 1101", city: "Lagos", status: "client" },
    { name: "Tunde Bakare", email: "tunde@example.com", phone: "+234 802 000 2202", city: "Abuja", status: "client" },
    { name: "Chloe Bennett", email: "chloe@example.co.uk", phone: "+44 7700 900123", city: "London", status: "client" },
    { name: "Marcus Reid", email: "marcus@example.com", phone: "+1 404 555 0142", city: "Atlanta", status: "client" },
    { name: "Ama Mensah", email: "ama@example.com", phone: "+233 24 000 3303", city: "Accra", status: "lead" },
    { name: "Kemi Adeyemi", email: "kemi@example.com", phone: "+234 809 000 4404", city: "Lagos", status: "client" },
    { name: "Priya Shah", email: "priya@example.co.uk", phone: "+44 7700 900456", city: "Manchester", status: "lead" },
  ]);
  const id = (name) => c.find((x) => x.name === name).id;

  const p = await ins("projects", [
    { client_id: id("Kemi Adeyemi"), title: "Maternity shoot", type: "Portrait", stage: "booked", session_date: addDays(4), amount: 450000, currency: "NGN" },
    { client_id: id("Chloe Bennett"), title: "Wedding film", type: "Videography", stage: "booked", session_date: addDays(21), amount: 3200, currency: "GBP", contract_signed: true, deposit_paid: true },
    { client_id: id("Marcus Reid"), title: "Brand campaign", type: "Commercial", stage: "editing", session_date: addDays(-6), amount: 4800, currency: "USD", contract_signed: true, deposit_paid: true },
    { client_id: id("Adaeze Okafor"), title: "40th birthday portraits", type: "Portrait", stage: "delivered", session_date: addDays(-18), amount: 380000, currency: "NGN", contract_signed: true, deposit_paid: true, gallery_delivered: true },
    { client_id: id("Tunde Bakare"), title: "Family session", type: "Family", stage: "shooting", session_date: addDays(1), amount: 520000, currency: "NGN", contract_signed: true, deposit_paid: true },
    { client_id: id("Ama Mensah"), title: "Bridal makeup trial", type: "Makeup", stage: "inquiry", session_date: addDays(12), amount: 150000, currency: "NGN" },
    { client_id: id("Priya Shah"), title: "Engagement shoot", type: "Portrait", stage: "inquiry", session_date: addDays(30), amount: 650, currency: "GBP" },
  ]);
  const pid = (title) => p.find((x) => x.title === title);

  const inv = (title, row) => { const pr = pid(title); return { client_id: pr.client_id, project_id: pr.id, ...row }; };
  await ins("invoices", [
    inv("Maternity shoot", { label: "Deposit (50%)", amount: 225000, currency: "NGN", due_date: addDays(2), status: "sent" }),
    inv("Brand campaign", { label: "Final balance", amount: 2400, currency: "USD", due_date: addDays(-2), status: "sent" }),
    inv("Brand campaign", { label: "Deposit (50%)", amount: 2400, currency: "USD", due_date: addDays(-30), status: "paid", paid_at: new Date(Date.now() - 31 * 864e5).toISOString() }),
    inv("Wedding film", { label: "Deposit (50%)", amount: 1600, currency: "GBP", due_date: addDays(-12), status: "paid", paid_at: new Date(Date.now() - 12 * 864e5).toISOString() }),
    inv("Wedding film", { label: "Final balance", amount: 1600, currency: "GBP", due_date: addDays(14), status: "draft" }),
    inv("Family session", { label: "Full payment", amount: 520000, currency: "NGN", due_date: addDays(-5), status: "paid", paid_at: new Date(Date.now() - 6 * 864e5).toISOString() }),
    inv("40th birthday portraits", { label: "Full payment", amount: 380000, currency: "NGN", due_date: addDays(-20), status: "paid", paid_at: new Date(Date.now() - 21 * 864e5).toISOString() }),
  ]);

  await ins("session_types", [
    { name: "Studio portrait", length_label: "2 hours", price: 140000, currency: "NGN", availability: "Tue–Sat" },
    { name: "Half-day shoot", length_label: "4 hours", price: 260000, currency: "NGN", availability: "Mon–Sat" },
    { name: "Wedding film", length_label: "Full day", price: 3200, currency: "GBP", availability: "Weekends" },
    { name: "Bridal makeup trial", length_label: "90 min", price: 150000, currency: "NGN", availability: "Wed, Fri" },
  ]);

  const at = (days, hh) => { const d = new Date(addDays(days) + "T00:00:00"); d.setHours(hh, 0, 0, 0); return d.toISOString(); };
  const bk = (title, row) => { const pr = pid(title); return { client_id: pr.client_id, project_id: pr.id, title: pr.type === "Makeup" ? "Bridal makeup trial" : pr.title, ...row }; };
  await ins("bookings", [
    bk("Family session", { starts_at: at(1, 10), location: "Lekki Studio" }),
    bk("Maternity shoot", { starts_at: at(4, 14), location: "Lekki Studio" }),
    bk("Bridal makeup trial", { starts_at: at(12, 11), location: "Client's home, Accra" }),
    bk("Wedding film", { starts_at: at(21, 9), location: "Hampstead, London" }),
  ]);

  const gl = (title, row) => { const pr = pid(title); return { client_id: pr.client_id, project_id: pr.id, ...row }; };
  await ins("galleries", [
    gl("40th birthday portraits", { title: "Adaeze at 40", status: "delivered", photo_count: 186, favourites: 42, downloads: 31, expires_on: addDays(9) }),
    gl("Brand campaign", { title: "Brand campaign · proofs", status: "proofing", photo_count: 248, favourites: 18, expires_on: addDays(20) }),
    gl("Family session", { title: "Bakare family", status: "draft" }),
  ]);

  await ins("messages", [
    { client_id: id("Ama Mensah"), channel: "whatsapp", from_client: true, body: "Hi! I saw your bridal trial package. Is the 18th free? It's for my wedding in December." },
    { client_id: id("Marcus Reid"), channel: "email", from_client: false, read: true, body: "Proofs are ready. Pick your favourites in the gallery and we'll finish the edits." },
    { client_id: id("Marcus Reid"), channel: "email", from_client: true, body: "Love them! The team picked 18. When can we expect finals?" },
    { client_id: id("Priya Shah"), channel: "email", from_client: true, body: "Hello, do you travel to Manchester for engagement shoots?" },
  ]);
}
