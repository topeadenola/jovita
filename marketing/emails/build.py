"""Builds Jovita's email templates.

out/brevo/<key>.html     Brevo transactional templates  ({{ params.x }} syntax)
out/supabase/<key>.html  Supabase sign-in emails         ({{ .ConfirmationURL }} syntax)
out/preview/<key>.html   Same emails filled with sample data, for review
templates.json           Name, subject and audience for each template (used by the uploader and the app)
"""
import json, os, re, html

LOGO = "https://getjovita.com/email/jovita-mark.png"
PLUM, MARI, LILAC, PAPER, INK, MUTED, LINE = "#261433", "#FFB320", "#E9DDFB", "#F4EFFA", "#261433", "#5E5069", "#E4DCEE"
DISPLAY = "'Bricolage Grotesque','Trebuchet MS',Arial,sans-serif"
BODY = "Figtree,'Segoe UI',Helvetica,Arial,sans-serif"


def p(text, style=""):
    return f'<p style="margin:0 0 16px;font:400 16px/1.6 {BODY};color:{INK};{style}">{text}</p>'


def button(label, href):
    return f'''<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 24px"><tr>
<td style="border-radius:12px;background:{PLUM}"><a href="{href}" target="_blank" style="display:inline-block;padding:15px 28px;font:700 16px/1 {BODY};color:#ffffff;text-decoration:none;border-radius:12px">{label}</a></td></tr></table>'''


def facts(rows):
    cells = "".join(
        f'<tr><td style="padding:12px 0;border-bottom:1px solid {LINE};font:400 15px/1.4 {BODY};color:{MUTED}">{k}</td>'
        f'<td align="right" style="padding:12px 0;border-bottom:1px solid {LINE};font:700 15px/1.4 {BODY};color:{INK}">{v}</td></tr>'
        for k, v in rows)
    return f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 24px">{cells}</table>'


def quote(text):
    return f'<div style="margin:4px 0 24px;padding:16px 18px;border-radius:14px;background:{PAPER};font:400 16px/1.55 {BODY};color:{INK}">{text}</div>'


def steps(items):
    rows = "".join(
        f'<tr><td valign="top" style="padding:0 14px 14px 0"><div style="width:28px;height:28px;border-radius:50%;background:{MARI};font:800 14px/28px {BODY};color:{PLUM};text-align:center">{i}</div></td>'
        f'<td style="padding:3px 0 14px;font:400 16px/1.5 {BODY};color:{INK}">{t}</td></tr>'
        for i, t in enumerate(items, 1))
    return f'<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 16px">{rows}</table>'


def layout(*, preheader, eyebrow, title, body, studio=None, signoff="", footer_note=""):
    """studio=None → Jovita-branded email. studio=(name_expr, logo_block) → client email in the studio's name."""
    if studio:
        name, logo_block = studio
        brand = f'''{logo_block}<span style="font:800 20px/1 {DISPLAY};color:{PLUM};vertical-align:middle">{name}</span>'''
        foot = f'Sent by {name} with <a href="https://getjovita.com" style="color:{MUTED}">Jovita</a>. Reply to this email to reach {name} directly.'
    else:
        brand = (f'<img src="{LOGO}" width="40" height="40" alt="" style="display:inline-block;vertical-align:middle;border:0;border-radius:10px;margin-right:10px">'
                 f'<span style="font:800 26px/1 {DISPLAY};color:{PLUM};vertical-align:middle;letter-spacing:-0.5px">jovita</span>')
        foot = f'Jovita · Run your creative business with joy · <a href="https://getjovita.com" style="color:{MUTED}">getjovita.com</a><br>Questions? Just reply, it comes to a real person.'
    eyebrow_html = f'<p style="margin:0 0 10px;font:800 12px/1 {BODY};letter-spacing:1.6px;text-transform:uppercase;color:#8F5A00">{eyebrow}</p>' if eyebrow else ""
    return f'''<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"><title>{re.sub("<[^>]+>", "", title)}</title>
<link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,800&family=Figtree:wght@400;700;800&display=swap" rel="stylesheet">
<style>@media (max-width:620px){{.card{{padding:28px 22px !important}} .h1{{font-size:28px !important}}}}</style></head>
<body style="margin:0;padding:0;background:{PAPER}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">{preheader}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:{PAPER}"><tr><td align="center" style="padding:32px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px">
<tr><td style="padding:0 8px 20px">{brand}</td></tr>
<tr><td class="card" style="background:#ffffff;border-radius:22px;padding:40px 40px 28px;border:1px solid {LINE}">
{eyebrow_html}<h1 class="h1" style="margin:0 0 18px;font:800 32px/1.12 {DISPLAY};color:{PLUM};letter-spacing:-0.6px">{title}</h1>
{body}
{signoff}
</td></tr>
<tr><td style="padding:22px 8px 0;font:400 13px/1.6 {BODY};color:{MUTED}">{foot}{("<br>" + footer_note) if footer_note else ""}</td></tr>
</table></td></tr></table></body></html>'''


# ---------- Brevo params helper ----------
P = lambda k: "{{ params.%s }}" % k
STUDIO_LOGO = ('{% if params.studio_logo %}<img src="{{ params.studio_logo }}" width="40" height="40" alt="" '
               'style="display:inline-block;vertical-align:middle;border:0;border-radius:10px;margin-right:10px;object-fit:cover">{% endif %}')
STUDIO = (P("studio_name"), STUDIO_LOGO)
SIGN_STUDIO = p(f'Thank you,<br><strong>{P("studio_name")}</strong>', "margin-top:8px")
SIGN_JOVITA = p("Jovita's got you,<br><strong>The Jovita team</strong>", "margin-top:8px")

T = []  # (key, name, audience, subject, html_fn)

def add(key, name, audience, subject, html):
    T.append(dict(key=key, name=name, audience=audience, subject=subject, html=html))

# ---- To creatives (from Jovita) ----
add("welcome", "Jovita · Welcome", "creative", f"Welcome to Jovita, {P('first_name')} 👋", layout(
    preheader="Your studio is ready. Here are three quick things to do first.",
    eyebrow="Welcome", title=f"Your studio is ready, {P('first_name')}.",
    body=p("Clients, bookings, invoices, contracts and galleries now live in one calm place. Here's the quickest way to feel at home:")
    + steps(["<strong>Add your logo and prices</strong> so every invoice and client page looks like you.",
             "<strong>Add your first client</strong>, or import your old list from a spreadsheet.",
             "<strong>Try Ask Jovita.</strong> Type \"create an invoice for…\" and watch it draft one for you."])
    + button("Open my studio", P("app_url")), signoff=SIGN_JOVITA))

add("trial_started", "Jovita · Pro trial started", "creative", "Your 7-day Pro trial has started ✨", layout(
    preheader="Your logo on every page, 300 Ask Jovita questions a month, and more.",
    eyebrow="Pro trial", title="Pro is yours for 7 days.",
    body=p("Everything in Pro is switched on until <strong>" + P("trial_end") + "</strong>:")
    + facts([("Your logo on client pages", "✓"), ("Ask Jovita", "300 questions a month"), ("Messages in your voice", "✓"), ("Payment reminders", "Automatic")])
    + p("No card needed. If you don't upgrade, you simply go back to Free and keep all your work.", f"color:{MUTED}")
    + button("Explore Pro", P("app_url")), signoff=SIGN_JOVITA))

add("trial_ending", "Jovita · Trial ending", "creative", "Your Pro trial ends in 2 days", layout(
    preheader="Keep Pro, or move back to Free. Nothing you made will be lost.",
    eyebrow="Heads up", title="Your Pro trial ends on " + P("trial_end") + ".",
    body=p("Want to keep your logo on client pages, Ask Jovita and automatic reminders? Upgrade before your trial ends and nothing changes.")
    + p("If you do nothing, your studio moves to the Free plan. Your clients, invoices and galleries stay exactly where they are.", f"color:{MUTED}")
    + button("Keep Pro", P("plans_url")), signoff=SIGN_JOVITA))

add("payment_received", "Jovita · Client paid", "creative", f"💸 {P('client_name')} paid {P('amount')}", layout(
    preheader=f"Invoice #{P('invoice_number')} is paid.",
    eyebrow="Money in", title=f"{P('client_name')} just paid you.",
    body=facts([("Amount", P("amount")), ("Invoice", "#" + P("invoice_number")), ("Paid with", P("method")), ("Still owed on this invoice", P("balance"))])
    + button("View invoice", P("link")), signoff=SIGN_JOVITA))

add("new_inquiry", "Jovita · New inquiry", "creative", f"New inquiry from {P('client_name')}", layout(
    preheader=P("message_preview"),
    eyebrow="New inquiry", title=f"{P('client_name')} wants to work with you.",
    body=quote("“" + P("message_preview") + "”") + facts([("About", P("subject")), ("Received", P("received_at"))])
    + p("Quick replies win bookings. Ask Jovita can draft one in your voice.", f"color:{MUTED}")
    + button("Reply in Jovita", P("link")), signoff=SIGN_JOVITA))

add("contract_signed", "Jovita · Contract signed", "creative", f"✍️ {P('client_name')} signed the contract", layout(
    preheader=f"{P('project_name')} is confirmed.",
    eyebrow="Signed", title=f"{P('client_name')} signed.",
    body=facts([("Project", P("project_name")), ("Signed", P("signed_at"))])
    + p("A signed copy is saved on the project for both of you.")
    + button("Open project", P("link")), signoff=SIGN_JOVITA))

# ---- To clients (in the studio's name) ----
add("invoice", "Client · Invoice", "client", f"Invoice #{P('invoice_number')} from {P('studio_name')}", layout(
    preheader=f"{P('amount')} due {P('due_date')}. Pay online in a minute.",
    eyebrow="Invoice", title=f"Hi {P('client_first_name')}, here's your invoice.", studio=STUDIO,
    body=facts([("Amount due", P("amount")), ("Due", P("due_date")), ("For", P("project_name"))])
    + p("You can pay by card, bank transfer or the options shown on the page.")
    + button("View and pay", P("link")), signoff=SIGN_STUDIO))

add("payment_reminder", "Client · Payment reminder", "client", f"Friendly reminder: invoice #{P('invoice_number')}", layout(
    preheader=f"{P('amount')} is {P('due_text')}.",
    eyebrow="Reminder", title=f"Hi {P('client_first_name')}, just a gentle nudge.", studio=STUDIO,
    body=p(f"Invoice #{P('invoice_number')} for <strong>{P('amount')}</strong> is {P('due_text')}. If you've already paid, thank you, and please ignore this.")
    + button("Pay now", P("link")), signoff=SIGN_STUDIO))

add("receipt", "Client · Receipt", "client", f"Receipt from {P('studio_name')}: thank you!", layout(
    preheader=f"We received {P('amount')}.",
    eyebrow="Payment received", title=f"Thank you, {P('client_first_name')}!", studio=STUDIO,
    body=facts([("Paid", P("amount")), ("Date", P("paid_at")), ("Method", P("method")), ("Balance left", P("balance"))])
    + button("View receipt", P("link")), signoff=SIGN_STUDIO))

add("contract", "Client · Contract to sign", "client", f"Your contract from {P('studio_name')} is ready", layout(
    preheader="Review and sign online. It takes about a minute.",
    eyebrow="Contract", title=f"Hi {P('client_first_name')}, your contract is ready.", studio=STUDIO,
    body=p(f"Please review the contract for <strong>{P('project_name')}</strong> and sign online. You'll both get a signed copy.")
    + button("Review and sign", P("link")), signoff=SIGN_STUDIO))

add("gallery", "Client · Gallery ready", "client", f"Your photos are ready ✨", layout(
    preheader=f"{P('gallery_name')} is ready to view and download.",
    eyebrow="Gallery", title=f"{P('client_first_name')}, your photos are here.", studio=STUDIO,
    body=p(f"<strong>{P('gallery_name')}</strong> is ready. Pick your favourites, download, and share.")
    + facts([("Photos", P("photo_count")), ("Available until", P("expires_at"))])
    + button("Open my gallery", P("link")), signoff=SIGN_STUDIO))

add("booking", "Client · Booking confirmed", "client", f"You're booked with {P('studio_name')} 📅", layout(
    preheader=f"{P('session_name')} on {P('date')}.",
    eyebrow="Booking confirmed", title="You're booked!", studio=STUDIO,
    body=facts([("Session", P("session_name")), ("When", P("date")), ("Where", P("location"))])
    + p("Need to change something? Just reply to this email.")
    + button("View details", P("link")), signoff=SIGN_STUDIO))

# ---- Supabase sign-in emails (Go template syntax) ----
SB = []
def sb(key, subject, eyebrow, title, text, label, note):
    SB.append(dict(key=key, subject=subject, html=layout(preheader=text, eyebrow=eyebrow, title=title,
        body=p(text) + button(label, "{{ .ConfirmationURL }}") + p(note, f"font-size:14px;color:{MUTED}"), signoff=SIGN_JOVITA)))

sb("confirm_signup", "Confirm your email for Jovita", "One last step", "Confirm your email.",
   "Tap the button to confirm this is your email and open your new studio.", "Confirm my email",
   "Didn't sign up for Jovita? You can ignore this email.")
sb("reset_password", "Reset your Jovita password", "Password", "Let's get you back in.",
   "Someone asked to reset the password for this account. Tap below to choose a new one.", "Choose a new password",
   "If this wasn't you, ignore this email. Your password stays the same.")
sb("magic_link", "Your Jovita sign-in link", "Sign in", "Here's your sign-in link.",
   "Tap the button to sign in to Jovita. The link works once and expires soon.", "Sign in to Jovita",
   "Didn't ask for this? You can safely ignore it.")
sb("invite", "You've been invited to Jovita", "Invitation", "You're invited to Jovita.",
   "You've been invited to join a studio on Jovita. Tap below to accept and set your password.", "Accept invitation",
   "Not expecting this? You can ignore this email.")
sb("email_change", "Confirm your new email for Jovita", "Email change", "Confirm your new email.",
   "Tap below to confirm {{ .NewEmail }} as the email for your Jovita account.", "Confirm new email",
   "Didn't ask for this change? Reply to this email and we'll help.")

# ---------- sample data for previews ----------
SAMPLE = dict(first_name="Smith", app_url="#", plans_url="#", trial_end="Fri 23 Oct", client_name="Tara Okafor",
    amount="₦1,400,000", invoice_number="1014", method="Paystack", balance="₦0", link="#",
    message_preview="Hi! Are you free for an engagement shoot in Lekki on 4 Nov? We'd love golden hour.",
    subject="Engagement shoot", received_at="Today, 09:42", project_name="Newborn session", signed_at="Thu 15 Oct, 18:20",
    studio_name="SmithLine Photography", studio_logo="", client_first_name="Tara", due_date="29 Oct", due_text="due in 3 days",
    paid_at="15 Oct 2026", gallery_name="Tara & Femi · Newborn", photo_count="86", expires_at="15 Jan 2027",
    session_name="Bridal portraits", date="Sat 24 Oct, 10:00", location="Studio 4, Ikate, Lagos")

def fill(h):
    h = re.sub(r"\{% if params\.studio_logo %\}.*?\{% endif %\}", "", h, flags=re.S)
    h = re.sub(r"\{\{ params\.(\w+) \}\}", lambda m: html.escape(SAMPLE.get(m.group(1), m.group(1))), h)
    return h.replace("{{ .ConfirmationURL }}", "#").replace("{{ .NewEmail }}", "new@example.com")

for d in ["out/brevo", "out/supabase", "out/preview"]:
    os.makedirs(d, exist_ok=True)
for t in T:
    open(f"out/brevo/{t['key']}.html", "w").write(t["html"])
    open(f"out/preview/{t['key']}.html", "w").write(fill(t["html"]))
for t in SB:
    open(f"out/supabase/{t['key']}.html", "w").write(t["html"])
    open(f"out/preview/auth-{t['key']}.html", "w").write(fill(t["html"]))
json.dump({"brevo": [{k: t[k] for k in ("key", "name", "audience", "subject")} for t in T],
           "supabase": [{k: t[k] for k in ("key", "subject")} for t in SB]}, open("templates.json", "w"), indent=2, ensure_ascii=False)
print(len(T), "brevo,", len(SB), "supabase")
