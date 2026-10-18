# Builds the simple website pages (Help centre, About, Privacy) into public/landing/<page>/index.html
# Run: python3 public/landing/pages/build.py
import os, re, html as H

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
APP = "https://app.getjovita.com"
MARK = '<svg viewBox="0 0 110 130" style="width:22px;height:26px" aria-hidden="true"><circle cx="32" cy="30" r="11" fill="{c}"></circle><circle cx="80" cy="30" r="11" fill="{c}"></circle><path d="M80 56 V86 A26 26 0 0 1 28 86" fill="none" stroke="#FFB320" stroke-width="18" stroke-linecap="round"></path></svg>'

CSS = """
:root{--plum:#261433;--ink:#261433;--muted:#5E5069;--line:#E4DCEE;--paper:#FBF8FF;--lilac:#E9DDFB;--marigold:#FFB320;--card:#FFFFFF}
*{box-sizing:border-box}
body{margin:0;background:var(--paper);color:var(--ink);font:400 17px/1.65 Figtree,'Segoe UI',Helvetica,Arial,sans-serif}
a{color:var(--plum);text-underline-offset:3px}a:hover{color:#4B2E66}
.wrap{width:100%;max-width:1080px;margin:0 auto;padding:0 32px}
header.top{position:sticky;top:0;z-index:5;background:rgba(251,248,255,.94);border-bottom:1px solid var(--line);backdrop-filter:blur(8px)}
header.top .wrap{display:flex;align-items:center;justify-content:space-between;gap:16px;height:68px}
.brand{display:flex;align-items:flex-end;gap:8px;text-decoration:none}
.brand span{font:800 28px/22px 'Bricolage Grotesque','Trebuchet MS',sans-serif;letter-spacing:-.04em;color:var(--plum)}
.top nav{display:flex;gap:22px;align-items:center;font-weight:600;font-size:15px}
.top nav a{text-decoration:none}.top nav a[aria-current]{text-decoration:underline;text-decoration-color:var(--marigold);text-decoration-thickness:3px}
.btn{display:inline-block;font-weight:700;font-size:15px;background:var(--plum);color:#fff !important;text-decoration:none;border-radius:14px;padding:11px 18px}
.hero{padding:64px 0 32px}
.eyebrow{margin:0 0 10px;font-weight:800;font-size:13px;letter-spacing:.14em;text-transform:uppercase;color:#8F5A00}
h1{margin:0 0 14px;font:800 52px/1.05 'Bricolage Grotesque','Trebuchet MS',sans-serif;letter-spacing:-.03em}
h2{margin:44px 0 12px;font:800 30px/1.15 'Bricolage Grotesque','Trebuchet MS',sans-serif;letter-spacing:-.02em;scroll-margin-top:90px}
h3{margin:26px 0 6px;font-size:19px;line-height:1.3;scroll-margin-top:90px}
.lead{font-size:20px;color:var(--muted);max-width:720px;margin:0}
.layout{display:grid;grid-template-columns:240px minmax(0,1fr);gap:48px;padding:16px 0 72px}
.toc{position:sticky;top:92px;align-self:start;display:flex;flex-direction:column;gap:6px;font-size:15px}
.toc b{font-size:13px;text-transform:uppercase;letter-spacing:.1em;color:var(--muted);margin-bottom:4px}
.toc a{text-decoration:none;color:var(--muted)}.toc a:hover{color:var(--plum)}
.prose{max-width:740px}.prose p,.prose li{color:#3A2948}.prose ul,.prose ol{padding-left:22px}.prose li{margin:4px 0}
.card{background:var(--card);border:1px solid var(--line);border-radius:20px;padding:22px 24px;margin:16px 0}
.card.lilac{background:var(--lilac);border-color:var(--lilac)}
.grid3{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px;margin:20px 0}
.grid3 .card{margin:0}
.grid3 a.card{text-decoration:none;display:block}.grid3 a.card:hover{border-color:#B9A6CF}
.grid3 b{display:block;font-size:18px;margin-bottom:4px}
.grid3 span{color:var(--muted);font-size:15px;line-height:1.5}
.tip{border-left:4px solid var(--marigold);background:#FFF6E3;padding:12px 16px;border-radius:0 12px 12px 0;margin:16px 0;font-size:16px}
.kbd{font:600 14px/1 ui-monospace,Menlo,monospace;background:#fff;border:1px solid var(--line);border-bottom-width:2px;border-radius:6px;padding:2px 6px}
.search{width:100%;max-width:560px;margin-top:22px;font:inherit;font-size:17px;padding:14px 18px;border-radius:14px;border:1px solid #CFC2DE;background:#fff}
.search:focus{outline:2px solid #7A4FD6;outline-offset:2px}
.hidden{display:none !important}
.meta{color:var(--muted);font-size:15px}
footer{background:var(--plum);color:#D9CCE6;padding:40px 0;font-size:15px}
footer .wrap{display:flex;flex-wrap:wrap;justify-content:space-between;gap:16px;align-items:center}
footer a{color:#D9CCE6}footer nav{display:flex;gap:20px;flex-wrap:wrap}
.values{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}
.values .card{margin:0}
@media (max-width:860px){.layout{grid-template-columns:minmax(0,1fr)}.toc{position:static;flex-direction:row;flex-wrap:wrap;gap:8px 14px}.toc b{width:100%}.grid3,.values{grid-template-columns:minmax(0,1fr)}}
@media (max-width:640px){.wrap{padding:0 16px}h1{font-size:38px}.top nav .hide-sm{display:none}.hero{padding:40px 0 20px}}
"""

def page(slug, title, desc, body, current):
    links = [("help", "Help centre"), ("about", "About"), ("privacy", "Privacy")]
    nav = "".join(f'<a href="/{k}/"{" aria-current=page" if k == current else ""} class="hide-sm">{n}</a>' for k, n in links)
    foot = "".join(f'<a href="/{k}/">{n}</a>' for k, n in links)
    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>{title} · Jovita</title>
<meta name="description" content="{desc}">
<meta name="theme-color" content="#261433">
<link rel="icon" type="image/svg+xml" href="../favicon.svg">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,800&amp;family=Figtree:wght@400;600;700;800&amp;display=swap">
<link rel="stylesheet" href="../pages/pages.css">
</head>
<body>
<header class="top"><div class="wrap">
<a class="brand" href="/" aria-label="Jovita home">{MARK.format(c="#261433")}<span>jovita</span></a>
<nav aria-label="Main">{nav}<a href="{APP}/login">Sign in</a><a class="btn" href="{APP}/signup">Start free</a></nav>
</div></header>
<main>
{body}
</main>
<footer><div class="wrap">
<span style="display:flex;align-items:flex-end;gap:8px">{MARK.format(c="#FBF8FF")}<b style="color:#fff">jovita</b> · Run your creative business with joy.</span>
<nav aria-label="Footer"><a href="/">Home</a>{foot}<a href="mailto:hello@getjovita.com">hello@getjovita.com</a></nav>
<span>© 2026 Jovita</span>
</div></footer>
</body>
</html>
"""

def toc(sections):
    return '<nav class="toc" aria-label="On this page"><b>On this page</b>' + "".join(f'<a href="#{i}">{t}</a>' for i, t in sections) + "</nav>"

# ---------------- HELP CENTRE ----------------
HELP = [
 ("start", "Getting started", """
<h3>Create your studio</h3>
<p>Sign up at <a href="https://app.getjovita.com/signup">app.getjovita.com</a> with your email. Jovita asks what you do (photographer, videographer, makeup artist or content creator) and sets up packages, contracts and emails that fit your work. You can change all of them later in <b>Settings › Templates</b>.</p>
<h3>Add your logo and details</h3>
<p>Go to <b>Settings › Your studio</b>. Add your studio name, your full name, your home currency and your logo (PNG, JPG, WebP or SVG, up to 5 MB). Your logo shows on invoices, quotes, contracts, galleries and every client page.</p>
<h3>Add your clients</h3>
<p>Add clients one by one from <b>Clients › New client</b>, or import your old list from a spreadsheet (CSV). Jovita matches the columns for you: name, email, phone and city.</p>
<h3>Use it on your phone</h3>
<p>Jovita works in any phone browser. Open <b>app.getjovita.com</b> and add it to your home screen. The phone app is coming soon.</p>"""),
 ("connect-email", "Connect your email", """
<p>Email works the moment you sign up. There's nothing to install and no password to share.</p>
<ol>
<li>Go to <b>Settings › Connections</b>.</li>
<li>Under <b>Email</b>, check <b>Client replies go to</b>. It starts as your sign-in email. Change it to your studio email if you have one, for example <i>hello@yourstudio.com</i>.</li>
<li>Turn on <b>Send me a copy</b> if you'd like a copy of every email Jovita sends your clients.</li>
</ol>
<h3>How it works</h3>
<ul>
<li>When you send an invoice, quote, contract, reminder or gallery, your client gets a branded email from <b>"Your Studio via Jovita"</b>, with your logo.</li>
<li>When your client presses reply, the reply goes straight to your own inbox (the address in <b>Client replies go to</b>), not to Jovita.</li>
<li>You can also tick <b>Send me a copy</b> on any single invoice or quote before you send it.</li>
</ul>
<div class="tip">Tip: no client email yet? Jovita copies the client's link instead, so you can paste it into any message.</div>
<h3>Client emails in your Jovita inbox</h3>
<p>When a client replies to an email Jovita sent, their reply lands in <b>Inbox</b> like a chat, and a copy goes to your own email. Reply from Inbox and it's emailed to them in your studio's name.</p>
<p>Want other client emails in Inbox too? Your private address is in <b>Settings › Connections</b> (it looks like <i>inbox+abc123@getjovita.com</i>). In Gmail, go to <b>Settings › Forwarding</b> and forward to it, or set up a filter that forwards only client emails. New people who email it are added as leads automatically.</p>"""),
 ("connect-calendar", "Connect Google Calendar", """
<ol>
<li>Go to <b>Settings › Connections</b> (or the <b>Bookings</b> page).</li>
<li>Press <b>Connect Google Calendar</b> and sign in to the Google account you use for your shoots.</li>
<li>Allow Jovita to see and edit events in your calendar.</li>
</ol>
<p>That's it. Bookings you make in Jovita appear in Google Calendar. Things you're busy with in Google show up in Jovita as busy time, so you never double-book. If you move a Jovita booking in Google, it moves in Jovita too.</p>
<p>To stop syncing, press <b>Disconnect</b>. Your bookings stay in Jovita.</p>"""),
 ("quotes", "Quotes", """
<p>A quote lets a new client see your price and say yes before you invoice them.</p>
<ol>
<li>Press <b>New › Quote</b> (or <b>Send quote</b> on a new inquiry).</li>
<li>Add your package or items, a valid-until date and any notes. It saves as you type.</li>
<li>Press <b>Send quote</b>. Your client gets an email with a link to their client page.</li>
</ol>
<p>When your client presses <b>Accept quote</b>, three things happen at once: the quote becomes an invoice they can pay, the project moves to <b>Booked</b>, and both of you get an email. You'll see <b>Quote viewed</b> as soon as they open it.</p>"""),
 ("invoices", "Invoices and getting paid", """
<h3>Send an invoice</h3>
<p>Press <b>New › Invoice</b>, choose the client and project, add items (or pick a package), and press <b>Send invoice</b>. When you type amounts, Jovita adds the commas for you, like 2,000,000.</p>
<h3>Know when it's been seen</h3>
<p>When your client opens their page, the invoice shows <b>Viewed</b> and it appears in <b>Today</b>, so you know when to follow up.</p>
<h3>Record a part payment</h3>
<p>Got a deposit by bank transfer or cash? Open the invoice and press <b>Record a payment</b>. Enter the amount, date and how they paid. Jovita shows what's left to pay everywhere, including on the client's page. When the full amount is in, the invoice is marked <b>Paid</b> automatically.</p>
<h3>Payment reminders</h3>
<p>Reminders are on by default. Clients get a friendly email before and after the due date until they pay. Turn them off for one invoice, or for your whole studio in <b>Settings › Reminders</b>.</p>
<h3>Online payments</h3>
<p>Connect Paystack, Flutterwave or PayPal, or add your bank details, in <b>Settings › Payments</b>. Money goes straight to your own account. Jovita never holds your money.</p>"""),
 ("galleries", "Galleries and storage", """
<ol>
<li>Open <b>Galleries › New gallery</b> and give it a name.</li>
<li>Drag your photos in. Jovita uploads several at once and makes fast previews, so the gallery opens quickly for your client.</li>
<li>Tap a photo to view it large. Tap the circle on a photo to select it, then <b>Delete</b>, <b>Move to</b> another set, or <b>Set as cover</b>.</li>
<li>Add a password if you want the gallery private, then <b>Publish</b> and share the link.</li>
</ol>
<h3>Storage on each plan</h3>
<ul><li><b>Free:</b> 500 MB</li><li><b>Pro:</b> 1 TB</li><li><b>Studio:</b> unlimited, with RAW photo support (CR2, CR3, NEF, ARW, DNG, RAF and more)</li></ul>
<div class="tip">Tip: export JPGs at full quality (around 3,000 to 4,000 px on the long edge) for the fastest uploads and the best-looking galleries.</div>"""),
 ("templates", "Contracts and templates", """
<p>In <b>Settings › Templates</b> you'll find ready-made contracts (wedding, portrait, family and couple sessions), a model release, client emails and packages. Press <b>Add ready-made templates</b> any time to bring in ones you don't have yet.</p>
<p>Words in {braces}, like {client_name} or {session_date}, fill in automatically for each client. Clients sign contracts and model releases online in their client page.</p>
<p>Our contracts are a starting point, not legal advice. Please check them against the law where you work.</p>"""),
 ("train-jovita", "Ask Jovita and training it", """
<p>Ask Jovita is your assistant inside the app (the speech bubble at the bottom right). Type things like <i>"create an invoice for Tara for 250,000"</i>, <i>"who owes me money?"</i> or <i>"draft a reply to Amaka"</i>. Jovita only acts when you ask, and always checks with you before anything goes to a client or touches money.</p>
<p>When you create an invoice for someone, Jovita also creates the project for you if there isn't one yet.</p>
<h3>Train your Jovita</h3>
<ol>
<li><b>Set your tone:</b> in <b>Settings › Jovita</b>, choose how warm and how long your messages should be.</li>
<li><b>Teach it facts:</b> in the same place, under <b>What Jovita knows about your studio</b>, add things like <i>"We always ask for a 50% deposit"</i> or <i>"I don't shoot on Sundays"</i>.</li>
<li><b>Tell it in chat:</b> start a message with <i>"Remember that…"</i>, for example <i>"Remember that my studio is in Lekki"</i>.</li>
</ol>
<p>You can see and forget anything Jovita has learned in <b>Settings › Jovita</b>. Jovita can make mistakes, so check important details before you send.</p>
<p>Press <span class="kbd">Enter</span> to send a message, and <span class="kbd">Shift</span> + <span class="kbd">Enter</span> for a new line.</p>"""),
 ("portal", "What your clients see", """
<p>Each project has its own private client page. Your client can accept a quote, sign the contract, pay, sign a model release, message you and open their gallery, all in one place, without making an account.</p>
<p>Clients can switch the page's language (English, French, Spanish, Portuguese or Swahili) with the language button at the top.</p>"""),
 ("account", "Account and plans", """
<h3>Change your plan</h3><p>Go to <b>Settings › Plan</b>. New studios can try Pro free for 7 days, no card needed. If you don't upgrade, you go back to Free and keep everything you made.</p>
<h3>Forgot your password?</h3><p>On the sign-in page, press <b>Forgot password</b> and we'll email you a link.</p>
<h3>Delete your account</h3><p>Email <a href="mailto:hello@getjovita.com">hello@getjovita.com</a> from your account email and we'll delete your studio and everything in it.</p>"""),
]

help_sections = "".join(f'<section class="hs-sec" data-text="{H.escape(re.sub(r"\s+", " ", re.sub("<[^>]+>", " ", t + " " + b)).lower(), quote=True)}"><h2 id="{i}">{t}</h2>{b}</section>' for i, t, b in HELP)
help_body = f"""
<section class="hero"><div class="wrap">
<p class="eyebrow">Help centre</p>
<h1>How can we help?</h1>
<p class="lead">Short answers for running your studio in Jovita. Can't find it? Email <a href="mailto:hello@getjovita.com">hello@getjovita.com</a>. A real person replies.</p>
<input class="search" id="q" type="search" placeholder="Search, e.g. part payment, logo, quote" aria-label="Search the help centre">
<div class="grid3">
<a class="card" href="#connect-email"><b>Connect your email</b><span>Send in your studio's name and get replies in your inbox.</span></a>
<a class="card" href="#quotes"><b>Quotes that book</b><span>Your client accepts, it becomes an invoice, the job is booked.</span></a>
<a class="card" href="#train-jovita"><b>Train your Jovita</b><span>Teach it your tone and the facts about your studio.</span></a>
</div>
</div></section>
<div class="wrap layout">
{toc([(i, t) for i, t, _ in HELP])}
<div class="prose" id="sections">{help_sections}<p id="none" class="hidden meta">Nothing found. Try another word, or email <a href="mailto:hello@getjovita.com">hello@getjovita.com</a>.</p></div>
</div>
<script>
const q=document.getElementById('q'),secs=[...document.querySelectorAll('.hs-sec')],none=document.getElementById('none');
q.addEventListener('input',()=>{{const v=q.value.trim().toLowerCase();let n=0;secs.forEach(s=>{{const hit=!v||s.dataset.text.includes(v);s.classList.toggle('hidden',!hit);if(hit)n++;}});none.classList.toggle('hidden',n>0);}});
</script>"""

# ---------------- ABOUT ----------------
about_body = """
<section class="hero"><div class="wrap">
<p class="eyebrow">About Jovita</p>
<h1>No PA. No operations manager.<br>Jovita's got you.</h1>
<p class="lead">Jovita is the friendly business assistant for photographers, videographers, makeup artists and content creators. Clients, bookings, quotes, invoices, contracts and galleries live in one calm place, so you can spend your time on the work you love.</p>
</div></section>
<div class="wrap" style="padding-bottom:72px">
<div class="prose">
<h2>Why we built Jovita</h2>
<p>Most creatives run their business on their own. The bookings come in through DMs and emails, the deposits are tracked in a notebook, contracts are sent as PDFs, and galleries go out through yet another app. Every hour spent chasing a payment is an hour not spent creating.</p>
<p>Big studios solve this by hiring a PA and an operations manager. Jovita gives a solo creative that same help, without the salary: it chases payments, sends contracts, books shoots, delivers galleries, drafts replies in your voice and keeps your books.</p>
<h2>What makes Jovita different</h2>
</div>
<div class="values">
<div class="card"><b>Galleries and studio in one app</b><p class="meta">Quotes, contracts, payments and beautiful client galleries together, instead of four tools that don't talk to each other.</p></div>
<div class="card"><b>Built for how you get paid</b><p class="meta">Paystack, Flutterwave, PayPal and bank transfer, in naira, pounds, dollars, euros and CFA francs. Money goes straight to you.</p></div>
<div class="card"><b>Ask Jovita</b><p class="meta">An assistant that knows your studio. Ask who owes you, create an invoice or draft a reply. It only acts when you ask.</p></div>
<div class="card"><b>Made for what you do</b><p class="meta">Tell Jovita your craft and it sets up packages, contracts and emails that fit, from weddings to makeup bookings.</p></div>
<div class="card"><b>Reminders on by default</b><p class="meta">Friendly payment reminders go out for you, so you never have to send the awkward message again.</p></div>
<div class="card"><b>Speaks your language</b><p class="meta">English, French, Spanish, Portuguese and Swahili, for you and for your clients.</p></div>
</div>
<div class="prose">
<h2>Who we're for</h2>
<p>Jovita is built first for creatives in Africa, the United Kingdom and the United States, starting with photographers, videographers, makeup artists and content creators. Designers, stylists and other creatives are next.</p>
<h2>Our promise</h2>
<ul>
<li><b>Your clients are yours.</b> We never contact your clients for our own marketing, and we never sell your data.</li>
<li><b>You stay in control.</b> Jovita never sends a message or touches money without you saying so.</li>
<li><b>Joy over admin.</b> Every screen is designed to be calm, clear and quick, on your laptop or your phone.</li>
</ul>
<h2>The team</h2>
<p>Jovita was founded by Tope Adenola and is built by a small, independent team that cares a lot about creatives and the craft of good software.</p>
<div class="card lilac"><b>Say hello</b><p style="margin:6px 0 0">Questions, ideas or partnerships: <a href="mailto:hello@getjovita.com">hello@getjovita.com</a>. Ready to try it? <a href="https://app.getjovita.com/signup">Start free</a>.</p></div>
</div>
</div>"""

# ---------------- PRIVACY ----------------
PRIV = [
 ("who", "Who we are", """<p>Jovita ("we", "us") provides business software for creatives at getjovita.com and app.getjovita.com. This policy explains what personal information we collect, why, and the choices you have. If you have a question, email <a href="mailto:hello@getjovita.com">hello@getjovita.com</a>.</p>
<p>There are two kinds of people whose information Jovita handles:</p>
<ul><li><b>Creatives</b> who sign up and use Jovita to run their business ("you").</li><li><b>Their clients</b>, whose details a creative adds to Jovita, and who use client pages and galleries.</li></ul>
<p>For creatives' own account information, we decide how it's used. For client information, the creative decides why it's collected and how it's used, and we process it on their behalf.</p>"""),
 ("collect", "What we collect", """<h3>From creatives</h3>
<ul><li>Account details: your name, email address, password (stored securely by our authentication provider, never readable by us), studio name, logo, language and currency.</li>
<li>Business content you add: clients, projects, bookings, quotes, invoices, payments you record, expenses, templates, contracts, messages and gallery photos.</li>
<li>Payment settings: your public payment keys and bank details shown to your clients. Secret payment keys are stored encrypted and can't be read back by anyone, including us.</li>
<li>Usage information: the pages you use, the features you try, and basic device information, so we can keep Jovita working and improve it.</li>
<li>If you connect Google Calendar: your Google email address and calendar events needed for two-way sync.</li></ul>
<h3>About clients</h3>
<ul><li>Details the creative adds: name, email, phone, city and project details.</li>
<li>What clients do on their page: when it was opened, contracts and releases signed (the typed name and time), payments reported, messages sent, and gallery favourites and downloads.</li></ul>"""),
 ("use", "How we use it", """<ul><li>To provide Jovita: storing your work, showing client pages and galleries, sending the emails you ask us to send, and syncing your calendar.</li>
<li>To send you account emails: sign-in links, password resets, trial and plan updates, and important service notices.</li>
<li>To power Ask Jovita: when you ask a question, the relevant details from your studio are sent to our AI provider to create an answer. They are not used to train AI models.</li>
<li>To keep Jovita safe, prevent abuse, and fix problems.</li>
<li>To understand how Jovita is used, in summary, so we can improve it.</li></ul>
<p>We never sell personal information, and we never use your clients' details to market to them.</p>"""),
 ("share", "Who we share it with", """<p>We use a small number of trusted providers to run Jovita. They only process information to provide their service to us:</p>
<ul><li><b>Supabase</b> for our database, sign-in and file storage (hosted in London, United Kingdom).</li>
<li><b>Cloudflare</b> to host and protect our website and app.</li>
<li><b>Brevo</b> to send emails.</li>
<li><b>Anthropic</b> to power Ask Jovita.</li>
<li><b>Google</b>, only if you connect Google Calendar.</li>
<li><b>Payment providers</b> you choose (Paystack, Flutterwave, PayPal, Stripe). Clients pay the creative directly through these providers; we don't receive or store card details.</li></ul>
<p>We may also share information if the law requires it, or to protect the rights and safety of our users.</p>"""),
 ("keep", "How long we keep it", """<p>We keep your information while your account is open. Galleries can be set to expire. If you delete your account, we delete your studio and its content within 30 days, apart from what we must keep by law (for example, records of payments to us) and backups, which are overwritten in the normal course.</p>"""),
 ("rights", "Your choices and rights", """<p>Depending on where you live (including under the UK GDPR, the EU GDPR and the Nigeria Data Protection Act), you can ask to see, correct, download or delete your personal information, or object to how it's used. Email <a href="mailto:hello@getjovita.com">hello@getjovita.com</a> and we'll reply within 30 days.</p>
<p><b>If you're a client</b> of a creative who uses Jovita, please contact that creative first, as they control your information. We'll help them respond.</p>
<p>You can also complain to your local data protection authority, for example the ICO in the UK or the NDPC in Nigeria.</p>"""),
 ("security", "Security", """<p>Information is encrypted in transit and at rest. Each studio can only see its own data, enforced in the database itself. Secret keys are stored encrypted and are never shown in the app. No system is perfectly secure, but we work hard to protect your information and will tell you promptly if a breach affects you.</p>"""),
 ("cookies", "Cookies and local storage", """<p>We use only what's needed to run Jovita: keeping you signed in and remembering your language and display settings. We don't use advertising cookies.</p>"""),
 ("children", "Children", """<p>Jovita is for adults running a business. Creatives may add information about children they photograph (for example, at a family session), with a parent or guardian's permission. We don't knowingly let children create accounts.</p>"""),
 ("international", "International transfers", """<p>Our main servers are in the United Kingdom. Some providers may process information in other countries. When they do, we use safeguards such as standard contractual clauses.</p>"""),
 ("changes", "Changes to this policy", """<p>If we make important changes, we'll tell you by email or in the app before they take effect. The date at the top shows when this policy last changed.</p>"""),
]
priv_body = f"""
<section class="hero"><div class="wrap">
<p class="eyebrow">Privacy</p>
<h1>Privacy policy</h1>
<p class="lead">Plain words on what we collect, why, and how you stay in control.</p>
<p class="meta">Last updated 18 October 2026</p>
</div></section>
<div class="wrap layout">
{toc([(i, t) for i, t, _ in PRIV])}
<div class="prose">{"".join(f'<h2 id="{i}">{t}</h2>{b}' for i, t, b in PRIV)}
<h2 id="contact">Contact us</h2><p>Email <a href="mailto:hello@getjovita.com">hello@getjovita.com</a> with any privacy question or request.</p></div>
</div>"""

os.makedirs(os.path.join(ROOT, "pages"), exist_ok=True)
open(os.path.join(ROOT, "pages", "pages.css"), "w").write(CSS.strip() + "\n")
for slug, title, desc, body in [
    ("help", "Help centre", "Short answers for running your creative business in Jovita: email, quotes, invoices, galleries and Ask Jovita.", help_body),
    ("about", "About us", "Jovita is the friendly business assistant for photographers, videographers, makeup artists and content creators.", about_body),
    ("privacy", "Privacy policy", "How Jovita collects, uses and protects personal information.", priv_body)]:
    os.makedirs(os.path.join(ROOT, slug), exist_ok=True)
    open(os.path.join(ROOT, slug, "index.html"), "w").write(page(slug, title, desc, body, slug))
print("built help, about, privacy")
