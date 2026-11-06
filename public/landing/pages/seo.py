# Builds the search pages (Jovita vs spreadsheets, Pixieset alternative, free contract template) into public/landing/<slug>/index.html
# Run: python3 public/landing/pages/seo.py public/landing
import os, sys, json, html as H

OUT = sys.argv[1] if len(sys.argv) > 1 else "out"
APP = "https://app.getjovita.com"
SITE = "https://getjovita.com"
MARK = '<svg viewBox="0 0 110 130" style="width:22px;height:26px" aria-hidden="true"><circle cx="32" cy="30" r="11" fill="{c}"></circle><circle cx="80" cy="30" r="11" fill="{c}"></circle><path d="M80 56 V86 A26 26 0 0 1 28 86" fill="none" stroke="#FFB320" stroke-width="18" stroke-linecap="round"></path></svg>'

EXTRA = """
.cmp{width:100%;border-collapse:collapse;background:#fff;border:1px solid var(--line);border-radius:20px;overflow:hidden;margin:18px 0;font-size:16px}
.cmp th,.cmp td{text-align:left;padding:13px 16px;border-bottom:1px solid var(--line);vertical-align:top}
.cmp thead th{background:var(--lilac);font-size:15px}
.cmp tbody tr:last-child td{border-bottom:0}
.cmp td:first-child{font-weight:700;width:30%}
.yes{color:#1F7A4D;font-weight:700}.no{color:#9A3B3B;font-weight:700}
.cta{background:var(--plum);color:#fff;border-radius:24px;padding:32px;margin:40px 0;display:flex;flex-wrap:wrap;gap:16px;align-items:center;justify-content:space-between}
.cta h2{margin:0;color:#fff;font-size:28px}.cta p{margin:6px 0 0;color:#D9CCE6}
.cta .btn{background:var(--marigold);color:var(--plum) !important}
.doc{background:#fff;border:1px solid var(--line);border-radius:20px;padding:28px;white-space:pre-wrap;font-size:16px;line-height:1.7}
.doc mark{background:#FFF1CC;color:var(--plum);border-radius:6px;padding:0 4px;font-weight:700}
.copy{margin-top:12px;font:700 15px Figtree,sans-serif;border:1px solid #CFC2DE;background:#fff;color:var(--plum);border-radius:12px;padding:10px 16px;cursor:pointer}
.faq h3{margin-top:22px}
.small{font-size:14px;color:var(--muted)}
.table-wrap{overflow-x:auto}
.wrap.narrow,.wrap.narrow.prose{max-width:804px}
.wrap.narrow.hero{padding-left:32px;padding-right:32px}
@media (max-width:640px){.wrap.narrow.hero{padding-left:16px;padding-right:16px}}
"""

def page(slug, title, desc, h1, lead, body, faq):
    canon = f"{SITE}/{slug}/"
    ld = [{"@context": "https://schema.org", "@type": "WebPage", "name": title, "description": desc, "url": canon,
           "publisher": {"@type": "Organization", "name": "Jovita", "url": SITE}}]
    if faq:
        ld.append({"@context": "https://schema.org", "@type": "FAQPage", "mainEntity": [
            {"@type": "Question", "name": q, "acceptedAnswer": {"@type": "Answer", "text": H.unescape(a.replace("<b>", "").replace("</b>", ""))}} for q, a in faq]})
    faq_html = "".join(f"<h3>{H.escape(q)}</h3><p>{a}</p>" for q, a in faq)
    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>{H.escape(title)}</title>
<meta name="description" content="{H.escape(desc)}">
<link rel="canonical" href="{canon}">
<meta property="og:type" content="article"><meta property="og:title" content="{H.escape(title)}"><meta property="og:description" content="{H.escape(desc)}"><meta property="og:url" content="{canon}"><meta property="og:site_name" content="Jovita">
<meta name="twitter:card" content="summary">
<meta name="theme-color" content="#261433">
<link rel="icon" type="image/svg+xml" href="../favicon.svg">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,800&amp;family=Figtree:wght@400;600;700;800&amp;display=swap">
<link rel="stylesheet" href="../pages/pages.css">
<style>{EXTRA}</style>
<script type="application/ld+json">{json.dumps(ld, ensure_ascii=False)}</script>
</head>
<body>
<header class="top"><div class="wrap">
<a class="brand" href="/" aria-label="Jovita home">{MARK.format(c="#261433")}<span>jovita</span></a>
<nav aria-label="Main"><a href="/help/" class="hide-sm">Help centre</a><a href="/about/" class="hide-sm">About</a><a href="{APP}/login">Sign in</a><a class="btn" href="{APP}/signup">Start free</a></nav>
</div></header>
<main>
<section class="wrap narrow hero"><p class="eyebrow">{H.escape(h1[0])}</p><h1>{H.escape(h1[1])}</h1><p class="lead">{lead}</p></section>
<div class="wrap narrow prose" style="padding-bottom:40px">
{body}
<div class="cta"><div><h2>Try Jovita free</h2><p>Quotes, contracts, invoices, galleries and payments in one place. No card needed.</p></div><a class="btn" href="{APP}/signup">Start free</a></div>
{('<section class="faq"><h2>Questions</h2>' + faq_html + '</section>') if faq else ''}
<p class="small" style="margin-top:32px">More: <a href="/jovita-vs-spreadsheets/">Jovita vs spreadsheets</a> · <a href="/pixieset-alternative/">Pixieset alternative</a> · <a href="/photography-contract-template/">Free photography contract template</a></p>
</div>
</main>
<footer><div class="wrap">
<span style="display:flex;align-items:flex-end;gap:8px">{MARK.format(c="#FBF8FF")}<b style="color:#fff">jovita</b> · Run your creative business with joy.</span>
<nav aria-label="Footer"><a href="/">Home</a><a href="/help/">Help centre</a><a href="/about/">About</a><a href="/privacy/">Privacy</a><a href="mailto:hello@getjovita.com">hello@getjovita.com</a></nav>
<span>© 2026 Jovita</span>
</div></footer>
<script>if (/(^|; )jv_in=1/.test(document.cookie)) {{ var n = document.querySelector(".top nav"), l = n.querySelector('a[href$="/login"]'), u = n.querySelector('a[href$="/signup"]'); if (l) l.remove(); if (u) {{ u.href = "{APP}/"; u.textContent = "Open Jovita"; }} }}</script>
</body>
</html>
"""

def row(*cells):
    return "<tr>" + "".join(f"<td>{c}</td>" for c in cells) + "</tr>"
Y, N = '<span class="yes">✓</span> ', '<span class="no">✗</span> '

# ---------- 1. Jovita vs spreadsheets ----------
spread_body = f"""
<p>Most photographers start the same way: a spreadsheet for bookings, a notebook for deposits, WhatsApp for everything else, contracts as PDFs, and galleries through WeTransfer or Google Drive. It works, until you have more than a few clients a month.</p>
<h2>Where spreadsheets start to hurt</h2>
<ul>
<li><b>Chasing payments.</b> You have to remember who owes what, then send the awkward "just checking in" message yourself.</li>
<li><b>Copying the same details everywhere.</b> The client's name goes into the sheet, the invoice, the contract and the email, and one typo means a wrong contract.</li>
<li><b>Nothing talks to anything.</b> The sheet doesn't know the contract was signed or the deposit landed, so you check three apps to answer one question.</li>
<li><b>It looks less professional.</b> A PDF on WhatsApp is harder to sign, pay and keep than one tidy page with everything in it.</li>
</ul>
<h2>Spreadsheets vs Jovita, side by side</h2>
<div class="table-wrap"><table class="cmp">
<thead><tr><th></th><th>Spreadsheet + WhatsApp</th><th>Jovita</th></tr></thead>
<tbody>
{row("Client list", "One row per client, typed by hand", Y + "Clients and leads with their projects, invoices and messages together. Import your old list from a CSV")}
{row("Quotes", "Typed into a message or PDF", Y + "Send packages; the client picks one and accepts online. It becomes an invoice by itself")}
{row("Contracts", "Edit the name and date in a Word file each time", Y + "Your contract fills in each client's name, address, fee and date. They sign online")}
{row("Getting paid", "Bank details in a message, then you check your account", Y + "Paystack, Flutterwave, Stripe or bank transfer, deposits and instalments, and reminders that go out for you")}
{row("Delivering photos", "WeTransfer or Drive links that expire", Y + "Branded galleries with favourites, downloads and your logo as a watermark")}
{row("Knowing where things stand", "Check the sheet, your bank and your chats", Y + "One Today screen: who owes you, what's overdue, what's booked this week")}
{row("Expenses and profit", "Another sheet", Y + "Expenses and profit per month, built in")}
{row("Cost", "Free, but it costs you hours", "Free plan to start. Paid plans add more")}
</tbody></table></div>
<h2>When a spreadsheet is still fine</h2>
<p>If you do one or two shoots a month and your clients pay up front, a simple sheet may be all you need. Once you are sending quotes, contracts and invoices every week, or you have ever lost track of a deposit, a tool built for the job will save you time and money.</p>
<h2>Moving from a spreadsheet to Jovita</h2>
<ol>
<li>Export your client sheet as a CSV (in Google Sheets: File › Download › CSV).</li>
<li>In Jovita, go to Clients › Import from file and drop it in. Jovita matches the columns for you, including name, email, phone, company, city and address.</li>
<li>Add your packages and your contract once in Settings › Templates. From then on, every client gets them filled in.</li>
</ol>
"""
spread_faq = [
 ("Is Jovita free?", "Yes, there is a free plan so you can try it with real clients. Paid plans add more, such as your logo on everything your clients see."),
 ("Can I import my spreadsheet?", "Yes. Export it as a CSV and use Clients › Import from file. Jovita matches the columns for you and skips anyone already added."),
 ("Does it work in Nigeria?", "Yes. Jovita was built in Lagos. You can bill in naira and take payments with Paystack, Flutterwave or bank transfer, as well as other currencies."),
]

# ---------- 2. Pixieset alternative ----------
pix_body = f"""
<p>Pixieset is a popular, polished platform for client galleries, with a print store, a website builder and a studio manager. If it works for you, great. But many photographers, especially in Nigeria and across Africa, look for an alternative because of price in dollars, payment options, or because they want everything in one simpler app. Here is an honest comparison.</p>
<h2>Jovita and Pixieset at a glance</h2>
<div class="table-wrap"><table class="cmp">
<thead><tr><th></th><th>Pixieset</th><th>Jovita</th></tr></thead>
<tbody>
{row("Price for galleries + business tools", "Suite from $35 a month ($28 billed yearly); galleries and Studio Manager are also sold separately", "Free plan; Pro $12 (₦15,000) a month, Studio $23 (₦30,000) a month")}
{row("Pay in naira", "Prices are in US dollars", Y + "Plans priced in naira, cedis, pounds, dollars, euros and CFA")}
{row("How clients pay you", "Pixieset Payments, Stripe or PayPal (depending on your country), and offline payments on paid plans", Y + "Paystack, Flutterwave, Stripe and bank transfer")}
{row("Quotes where the client picks a package", "Invoices and quotes in Studio Manager", Y + "Client picks one package, ticks optional extras and accepts online")}
{row("Contracts with e-signature", Y + "Yes", Y + "Yes, and each client's details fill in by themselves")}
{row("Client galleries", Y + "Yes, very polished", Y + "Yes, with favourites, downloads, logo watermarks and saved designs")}
{row("Protecting a gallery", "Password and download PIN", Y + "Password and download PIN, plus a lock that opens the gallery only once the contract is signed and the balance is paid")}
{row("Your own web address for client links", Y + "Custom domain on upgraded Client Gallery, Website and Suite plans; you can buy a domain or connect yours through Pixieset", Y + "Every studio gets yourstudio.getjovita.com free. On the Studio plan, connect your own domain, e.g. gallery.yourstudio.com (you add one DNS record; Jovita shows you how)")}
{row("Print store and lab orders", Y + "Yes, a mature print store", N + "Not yet")}
{row("Website builder", Y + "Yes", N + "No full website builder")}
</tbody></table></div>
<p class="small">Pixieset prices checked in November 2026 from public sources; they can change, so check pixieset.com for the latest. Jovita prices as of November 2026.</p>
<h2>Choose Pixieset if…</h2>
<ul>
<li>You sell a lot of prints and albums through a built-in lab store.</li>
<li>You want a gallery company and website builder in one, and you are happy paying in dollars.</li>
</ul>
<h2>Choose Jovita if…</h2>
<ul>
<li>You want quotes, contracts, invoices, payments and galleries in one simple app, without paying for separate products.</li>
<li>Your clients pay with Paystack, Flutterwave or bank transfer, and you bill in naira or another African currency.</li>
<li>You want payment reminders, gallery locking, and Ask Jovita: type "give Ada 10% off" or "add 50k diesel to my expenses" and it's done in a tap.</li>
</ul>
<h2>Switching from Pixieset</h2>
<ol>
<li>Export your contacts from Pixieset (Contacts › Actions › Export Contacts).</li>
<li>In Jovita, go to Clients › Import from file. Pixieset's columns, including Lead or Client, are picked up automatically.</li>
<li>Add your packages and contract once, then send your next quote from Jovita.</li>
</ol>
"""
pix_faq = [
 ("Is Jovita cheaper than Pixieset?", "For most solo creatives, yes. Jovita has a free plan, and Pro is $12 (₦15,000) a month for quotes, contracts, invoices, payments and galleries together, while Pixieset's Suite starts at $35 a month. Prices change, so check both sites."),
 ("Can I move my clients from Pixieset to Jovita?", "Yes. Export your contacts from Pixieset as a CSV and import the file in Jovita under Clients › Import from file."),
 ("Does Jovita take Paystack and Flutterwave?", "Yes. Clients can pay with Paystack, Flutterwave, Stripe or bank transfer, in naira and other currencies."),
]

# ---------- 3. Free photography contract template ----------
F = lambda s: f"<mark>[{s}]</mark>"
contract = f"""Portrait Photography Agreement

This agreement is made on {F("Today's date")} between {F("Client name")}, {F("Client address")} ("the Client"), and {F("Your studio name")} ("the Photographer").

1. The session
The Photographer will photograph the Client's {F("Session name")} on {F("Session date")} at {F("Session location")}. The Photographer is the only photographer for this session unless both agree otherwise in writing.

2. Fee and payment
The total fee is {F("Fee")}. A non-refundable {F("70%")} deposit is due when this agreement is signed and secures the date. The remaining {F("30%")} is due on the day of the shoot.

3. Extra costs
If the session is outside {F("Your city")}, the Client covers reasonable travel costs. The Client also pays for anything extra the session needs, such as permits, special equipment or sets.

4. Cancelling or rescheduling
If the Client cancels, the deposit is not refunded. If the Client reschedules with at least {F("5")} days' notice, the deposit moves to the new date. If the Photographer has to cancel, the Client gets the full deposit back or a new date.

5. Late arrival
Time lost when the Client arrives late comes off the session, with no refund.

6. Style
The Client has seen the Photographer's portfolio and expects a similar style. The Photographer will work in that style but cannot guarantee specific results.

7. Copyright and use
The Photographer keeps the copyright. The Client may print and share the images for personal use, including on social media, but may not sell them or use them commercially without written permission. The Photographer may use the images in their portfolio, website and social media unless the Client asks otherwise in writing.

8. Things outside our control
The Photographer is not responsible for things outside their control that affect the session, such as weather or illness.

9. Length of this agreement
This agreement lasts until the fee is paid in full and the final images are delivered. It is the whole agreement for this session and replaces anything agreed before.

Signed by the Client: ______________________   Date: __________
Signed by the Photographer: ________________   Date: __________"""
plain = contract.replace("<mark>", "").replace("</mark>", "")
contract_body = f"""
<p>Here is a short, plain-English photography contract you can copy and use for portrait sessions. Change the parts in brackets for each client. It covers the fee and deposit, cancellations, late arrival, copyright and how you can use the photos.</p>
<div class="tip">This is a starting point, not legal advice. Laws differ by country, so have a lawyer check it before you rely on it.</div>
<h2>The template</h2>
<div class="doc" id="contract">{contract}</div>
<button class="copy" type="button" onclick="navigator.clipboard.writeText(document.getElementById('plain').value).then(()=>{{this.textContent='Copied'}})">Copy the contract</button>
<textarea id="plain" hidden>{H.escape(plain)}</textarea>
<h2>What each part is for</h2>
<ul>
<li><b>Fee and payment:</b> a deposit that secures the date protects you from no-shows. Many photographers ask for 50 to 70%.</li>
<li><b>Cancelling or rescheduling:</b> says what happens to the deposit, so there is no argument later.</li>
<li><b>Copyright and use:</b> you keep the copyright, the client can print and share for personal use, and you can show the work in your portfolio.</li>
<li><b>Things outside our control:</b> covers weather, illness and other things nobody can plan for.</li>
</ul>
<h2>Stop filling in names by hand</h2>
<p>In Jovita, you add this contract once. Every time you send it, the client's name, address, fee, date and location fill in by themselves, and the client signs online on their own page. You see the moment it is signed. You can even keep their gallery locked until the contract is signed and the balance is paid.</p>
"""
contract_faq = [
 ("Is this photography contract free?", "Yes. Copy it, change the parts in brackets, and use it for your sessions."),
 ("Can clients sign it online?", "Yes, if you send it with Jovita. Each client gets their own page to read and sign the contract, with their details already filled in."),
 ("Is this contract legally binding?", "A signed agreement is usually binding, but laws differ by country. Have a lawyer check the template for where you work before you rely on it."),
]

PAGES = [
 ("jovita-vs-spreadsheets", "Jovita vs spreadsheets: a better way to manage photography clients",
  "Still running your photography business on spreadsheets and WhatsApp? See how Jovita handles quotes, contracts, payments and galleries in one place.",
  ("Jovita vs spreadsheets", "Manage your photography clients without spreadsheets"),
  "Spreadsheets are free, but chasing payments, retyping names and juggling apps costs you hours every week. Here's how a studio app compares.",
  spread_body, spread_faq),
 ("pixieset-alternative", "Pixieset alternative for photographers in Nigeria and Africa · Jovita",
  "Looking for a Pixieset alternative? Compare Jovita and Pixieset on price, naira billing, Paystack and Flutterwave, contracts, invoices and client galleries.",
  ("Pixieset alternative", "A Pixieset alternative built for African creatives"),
  "Quotes, contracts, invoices, payments and client galleries in one app, priced in naira and paid with Paystack, Flutterwave or bank transfer.",
  pix_body, pix_faq),
 ("photography-contract-template", "Free photography contract template (copy and use) · Jovita",
  "A free, plain-English photography contract template for portrait sessions. Covers deposit, cancellation, late arrival and copyright. Copy it in one click.",
  ("Free template", "Photography contract template"),
  "A short, clear contract for portrait sessions. Copy it, change the parts in brackets, and send it to your client.",
  contract_body, contract_faq),
]
for slug, title, desc, h1, lead, body, faq in PAGES:
    os.makedirs(os.path.join(OUT, slug), exist_ok=True)
    open(os.path.join(OUT, slug, "index.html"), "w").write(page(slug, title, desc, h1, lead, body, faq))
print("built", ", ".join(p[0] for p in PAGES))
