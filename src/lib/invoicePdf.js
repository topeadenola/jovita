// Download an invoice or quote as a real PDF (sharp text, not a screenshot), laid out like the preview.
// Fonts: Figtree for text, Bricolage Grotesque for headings and amounts (it has ₦ and ₵; Figtree doesn't).
import { tx } from "./i18n";
import { fdate, money } from "./format";
import { supabase } from "../supabase";

const PLUM = [38, 20, 51], MUTED = [94, 80, 105], LINE = [228, 220, 238], SUNKEN = [243, 237, 251], GOOD = [31, 122, 77], GOOD_TINT = [227, 245, 235];
const FONTS = [["Figtree_400Regular.ttf", "Figtree", "normal"], ["Figtree_700Bold.ttf", "Figtree", "bold"], ["BricolageGrotesque_400Regular.ttf", "Bricolage", "normal"], ["BricolageGrotesque_700Bold.ttf", "Bricolage", "bold"]];
let fontCache = null;

const toB64 = (buf) => { let s = ""; const b = new Uint8Array(buf); for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000)); return btoa(s); };
async function loadFonts() {
  if (!fontCache) fontCache = Promise.all(FONTS.map(async ([f]) => toB64(await (await fetch(`/fonts/${f}`)).arrayBuffer())));
  return fontCache;
}
// The studio logo: straight from storage first (always allowed), then the public link
async function logoBlob(path, url) {
  if (path) { try { const { data } = await supabase.storage.from("studio-assets").download(path); if (data?.size) return data; } catch { /* try the link */ } }
  if (url) { try { const r = await fetch(url, { mode: "cors", cache: "no-store" }); if (r.ok) return await r.blob(); } catch { /* no logo */ } }
  return null;
}
async function loadImage(path, url) {
  const blob = await logoBlob(path, url);
  if (!blob) return null;
  try {
    const src = URL.createObjectURL(blob);
    const img = await new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = src; });
    // Redraw as PNG so any image type works (SVG, WebP, JPG), and keep its shape
    const scale = Math.min(1, 600 / Math.max(img.naturalWidth || 600, img.naturalHeight || 600)) || 1;
    const c = document.createElement("canvas"); c.width = Math.round((img.naturalWidth || 600) * scale); c.height = Math.round((img.naturalHeight || 600) * scale);
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
    URL.revokeObjectURL(src);
    return { data: c.toDataURL("image/png"), w: c.width, h: c.height };
  } catch { return null; }
}

// doc: { kind, number, status, due_date, created_at, paid_at, amount_paid, currency, items, notes, discount, tax, tax_rate,
//        subtotal, total, schedule: [{ due, amount }], methods: [labels], studio, client, project, logoUrl, brand }
export async function invoicePdf(doc) {
  const [{ jsPDF }, fonts, logo] = await Promise.all([import("jspdf"), loadFonts(), loadImage(doc.logoPath, doc.logoUrl)]);
  const pdf = new jsPDF({ unit: "mm", format: "a4" });
  FONTS.forEach(([f, name, style], k) => { pdf.addFileToVFS(f, fonts[k]); pdf.addFont(f, name, style); });
  const W = 210, H = 297, M = 18, R = W - M;
  const cur = doc.currency, $ = (v) => money(v, cur);
  const quote = doc.kind === "quote";
  let y = M;
  const font = (f, s, c = PLUM, size) => { pdf.setFont(f, s); pdf.setTextColor(...c); if (size) pdf.setFontSize(size); };
  const room = (h) => { if (y + h > H - 22) { pdf.addPage(); y = M; } };

  // Header: logo and studio name, document number, due date
  let x = M;
  if (logo) { const h = 16, w = Math.min(44, (logo.w / logo.h) * h); pdf.addImage(logo.data, "PNG", M, y, w, h); x = M + w + 5; }
  font("Bricolage", "bold", PLUM, 16); pdf.text(doc.studio?.name || "", x, y + 6.5);
  font("Figtree", "normal", MUTED, 10); pdf.text(quote ? tx("Quote #{number}", { number: doc.number }) : tx("Invoice #{number}", { number: doc.number }), x, y + 12.5);
  font("Figtree", "normal", MUTED, 9); pdf.text(quote ? tx("Valid until") : tx("Due"), R, y + 4, { align: "right" });
  font("Bricolage", "bold", PLUM, 13); pdf.text(fdate(doc.due_date), R, y + 10, { align: "right" });
  font("Figtree", "normal", MUTED, 9); pdf.text(tx("Issued {date}", { date: fdate(doc.created_at) }), R, y + 15, { align: "right" });
  y += 24;
  pdf.setDrawColor(...LINE); pdf.setLineWidth(0.3); pdf.line(M, y, R, y); y += 8;

  // Bill to (and paid stamp)
  font("Figtree", "normal", MUTED, 9); pdf.text(tx("Bill to"), M, y);
  font("Figtree", "bold", PLUM, 12); pdf.text(doc.client?.name || "", M, y + 6);
  let by = y + 6;
  font("Figtree", "normal", MUTED, 10);
  [doc.client?.email, doc.client?.phone, doc.project?.title].filter(Boolean).forEach((s) => { by += 5; pdf.text(String(s), M, by); });
  if (doc.status === "paid" && !quote) {
    const label = tx("Paid {date}", { date: fdate(doc.paid_at) });
    font("Figtree", "bold", GOOD, 10); const w = pdf.getTextWidth(label) + 10;
    pdf.setFillColor(...GOOD_TINT); pdf.roundedRect(R - w, y - 4, w, 9, 4.5, 4.5, "F"); pdf.text(label, R - w / 2, y + 2, { align: "center" });
  }
  y = by + 10;

  // Items
  const cQty = R - 62, cAmt = R;
  const head = () => {
    pdf.setFillColor(...SUNKEN); pdf.roundedRect(M, y, R - M, 9, 2, 2, "F");
    font("Figtree", "bold", MUTED, 8.5);
    pdf.text(tx("Item").toUpperCase(), M + 4, y + 6); pdf.text(tx("Qty × Price").toUpperCase(), cQty, y + 6, { align: "right" }); pdf.text(tx("Amount").toUpperCase(), cAmt - 4, y + 6, { align: "right" });
    y += 13;
  };
  head();
  (doc.items || []).forEach((it) => {
    font("Figtree", "normal", MUTED, 9);
    const desc = it.description ? pdf.splitTextToSize(String(it.description), cQty - M - 50) : [];
    font("Figtree", "bold", PLUM, 10.5);
    const name = pdf.splitTextToSize(it.name || tx("Item"), cQty - M - 50);
    const h = name.length * 5 + desc.length * 4.2 + 5;
    if (y + h > H - 22) { pdf.addPage(); y = M; head(); }
    pdf.text(name, M + 4, y);
    font("Bricolage", "normal", MUTED, 10); pdf.text(`${Number(it.qty) || 0} × ${$(it.price)}`, cQty, y, { align: "right" });
    font("Bricolage", "bold", PLUM, 10.5); pdf.text($((Number(it.qty) || 0) * (Number(it.price) || 0)), cAmt - 4, y, { align: "right" });
    if (desc.length) { font("Figtree", "normal", MUTED, 9); pdf.text(desc, M + 4, y + name.length * 5); }
    y += h; pdf.setDrawColor(...LINE); pdf.line(M, y - 3, R, y - 3); y += 2;
  });

  // Totals
  const line = (label, value, strong) => {
    room(9);
    font("Figtree", strong ? "bold" : "normal", strong ? PLUM : MUTED, strong ? 11 : 10); pdf.text(label, cQty, y, { align: "right" });
    font("Bricolage", strong ? "bold" : "normal", PLUM, strong ? 13 : 10.5); pdf.text(value, cAmt - 4, y, { align: "right" });
    y += strong ? 8 : 6;
  };
  y += 2;
  line(tx("Subtotal"), $(doc.subtotal));
  if (doc.discount > 0) line(tx("Discount"), "− " + $(doc.discount));
  if (doc.tax > 0) line(tx("Tax ({rate}%)", { rate: doc.tax_rate }), $(doc.tax));
  line(tx("Total"), $(doc.total), true);
  if (Number(doc.amount_paid) > 0 && !quote) {
    line(tx("Paid so far"), "− " + $(doc.amount_paid));
    room(14);
    pdf.setFillColor(...SUNKEN); pdf.roundedRect(cQty - 46, y - 5.5, cAmt - cQty + 46, 11, 2, 2, "F");
    line(tx("Balance due"), $(Math.max(0, doc.total - Number(doc.amount_paid))), true);
  }
  y += 4;

  // Payment schedule
  if ((doc.schedule || []).length > 1) {
    room(12 + doc.schedule.length * 6);
    font("Figtree", "bold", PLUM, 10.5); pdf.text(tx("Payment schedule"), M, y); y += 6;
    doc.schedule.forEach((r, i) => {
      font("Figtree", "normal", MUTED, 10); pdf.text(`${tx("Payment {a} of {b}", { a: i + 1, b: doc.schedule.length })} · ${r.due ? fdate(r.due) : tx("On receipt")}`, M, y);
      font("Bricolage", "bold", PLUM, 10.5); pdf.text($(r.amount), R, y, { align: "right" }); y += 6;
    });
    y += 4;
  }

  // Notes
  if (doc.notes) {
    font("Figtree", "normal", PLUM, 10);
    const lines = pdf.splitTextToSize(String(doc.notes), R - M);
    room(10 + Math.min(lines.length, 8) * 5);
    font("Figtree", "bold", PLUM, 10.5); pdf.text(tx("Notes"), M, y); y += 6;
    font("Figtree", "normal", PLUM, 10);
    lines.forEach((l) => { room(5); pdf.text(l, M, y); y += 5; });
    y += 4;
  }

  // How to pay
  if ((doc.methods || []).length) {
    room(12);
    pdf.setDrawColor(...LINE); pdf.line(M, y, R, y); y += 7;
    font("Figtree", "normal", MUTED, 10); pdf.text(`${tx("Pay by")}: ${doc.methods.join(", ")}`, M, y);
  }

  // Footer on every page
  const pages = pdf.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    pdf.setPage(p);
    font("Figtree", "normal", MUTED, 8.5);
    const left = [doc.studio?.name, doc.studio?.email].filter(Boolean).join(" · ");
    pdf.text(left, M, H - 10);
    pdf.text(pages > 1 ? `${doc.brand ? tx("Made with Jovita") + " · " : ""}${p} / ${pages}` : doc.brand ? tx("Made with Jovita") : "", R, H - 10, { align: "right" });
  }

  const who = String(doc.client?.name || "").replace(/[^\p{L}\p{N} ]/gu, "").trim().replace(/\s+/g, "-");
  const file = `${quote ? tx("Quote") : tx("Invoice")}-${doc.number}${who ? "-" + who : ""}.pdf`;
  pdf.save(file);
  return file;
}
