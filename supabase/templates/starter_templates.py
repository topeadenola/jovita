# Jovita starter templates: real contracts, model release, emails and packages for photographers.
# Run:  python3 supabase/templates/starter_templates.py  → writes starter_templates.sql (pasted into update 8)
# Merge fields in {braces} are filled in by Jovita (see src/lib/merge.js).
import json, os

FOOT = """
Signatures
Signed online by {client_name} through Jovita. A typed name and a ticked box count as a signature, and both parties get a copy.
This contract is a starting point and not legal advice. {studio_name} should check it suits local law."""

def terms(kind_line, extras):
    return f"""{kind_line}

1. Fee and deposit
The total fee is {{project_amount}}. A non-refundable deposit of 50% secures the date; the date is not held until it is paid. The balance is due 7 days before the session unless the invoice says otherwise. Payments are made through the client page or by bank transfer.

2. Late payment
If the balance is not paid on time, {{studio_name}} may hold the delivery of images until it is paid.
""" + extras + FOOT

CONTRACTS = [
  ("Wedding photography contract", True, terms(
"""This agreement is between {studio_name} ("the Photographer") and {client_name} ("the Client") for wedding photography on {session_date}.""",
"""
3. Coverage
The Photographer will cover the wedding for the hours listed on the invoice or quote, including travel time between locations on the day. Extra time on the day is charged at the hourly rate on the invoice and added to the final balance.

4. Schedule and contact person
The Client will share a timeline, the main locations and a family photo list at least 14 days before the wedding, and name one contact person for the day. The Photographer is not responsible for missed moments caused by a changed schedule, late arrivals, or venue restrictions.

5. Meals and breaks
For coverage longer than 6 hours, the Client provides a meal and a short break for the Photographer and any assistant.

6. Delivery
A preview of 20 to 40 images is shared within 7 days. The full edited gallery is delivered online within 8 weeks. The Photographer chooses which images are edited and delivered, in their own style. RAW files are not included.

7. Usage
The Client may print and share the images for personal use, credited where possible. The Photographer keeps the copyright and may use images for their portfolio, website and social media, unless the Client asks in writing before the wedding.

8. Postponement and cancellation
If the wedding moves, the deposit moves to the new date once, if the Photographer is free. If the Client cancels, the deposit is kept; cancellations within 60 days of the wedding owe 50% of the remaining balance.

9. If the Photographer can't attend
In the rare case of illness or emergency, the Photographer will find a suitable replacement photographer. If no replacement is found, all money paid is refunded in full. Liability is limited to the amount paid.

10. Second shooter
If a second photographer is included, they work under the Photographer's direction, and their images are delivered in the same gallery.
""")),
  ("Portrait session contract", True, terms(
"""This agreement is between {studio_name} ("the Photographer") and {client_name} ("the Client") for a portrait session on {session_date}.""",
"""
3. The session
The session length, location and number of outfits are as listed on the invoice. If the Client arrives more than 20 minutes late, the session may be shortened without a refund.

4. Hair, makeup and styling
Unless included on the invoice, the Client arranges their own hair, makeup and outfits. Studio props are available on request.

5. Delivery
The Client picks favourites from an online proofing gallery within 7 days of the session. The final retouched images are delivered within 14 days of the picks. Extra retouched images can be bought at the price on the invoice.

6. Usage
The Client may print and share the images for personal use. Commercial use (adverts, brand campaigns, product packaging) needs a separate licence. The Photographer keeps the copyright and may use images in their portfolio unless the Client opts out in writing.

7. Rescheduling and cancellation
The session can be moved once with at least 48 hours' notice. Cancellations with less than 48 hours' notice, or no-shows, lose the deposit.

8. Weather (outdoor sessions)
If the weather makes an outdoor session impossible, the Photographer will offer a new date at no cost.
""")),
  ("Family session contract", False, terms(
"""This agreement is between {studio_name} ("the Photographer") and {client_name} ("the Client") for a family photography session on {session_date}.""",
"""
3. Who is included
The session covers the immediate family members agreed when booking. Extra family members or groups can be added at the price on the invoice.

4. Children
Little ones have their own timing. The Photographer will be patient and flexible, and the session can include short breaks. A parent or guardian stays with their children for the whole session and is responsible for their safety.

5. Delivery
Edited images are delivered in an online gallery within 21 days. The Photographer chooses the best images and edits them in their own style.

6. Usage
The family may print and share the images for personal use. Images of children are only shared publicly by the Photographer if a model release is signed.

7. Rescheduling and illness
If a family member is unwell, the session can be moved once at no cost with notice before the session.

8. Cancellation
The deposit is non-refundable if the Client cancels within 7 days of the session.
""")),
  ("Couple session contract", False, terms(
"""This agreement is between {studio_name} ("the Photographer") and {client_name} ("the Client") for a couple session (engagement, pre-wedding or anniversary) on {session_date}.""",
"""
3. The session
Session length, number of locations and outfit changes are as listed on the invoice. Location permits and entrance fees, if any, are paid by the Client.

4. Planning
The Photographer will share a short guide on outfits and locations. The Client confirms the location and start time at least 3 days before.

5. Delivery
A sneak peek of 5 images is shared within 3 days. The full edited gallery is delivered within 14 days.

6. Pre-wedding use
Images may be used on save-the-dates, wedding websites and at the wedding itself. Printing services may need a copyright release, which the Photographer will provide.

7. Usage
The Photographer keeps the copyright and may use images in their portfolio unless the Client opts out in writing.

8. Rescheduling and cancellation
The session can be moved once with 48 hours' notice, or for bad weather at no cost. Late cancellations lose the deposit.
""")),
]

RELEASE = """Model release

I, {client_name}, give {studio_name} permission to use photographs and video of me (and of my children named below, if any) taken on {session_date}, for:
- {studio_name}'s portfolio and website
- social media (Instagram, Facebook, TikTok and similar)
- printed marketing such as flyers, albums and exhibition prints
- photography competitions and publications

I understand that:
- I won't be paid for this use beyond what's agreed in the contract.
- {studio_name} will not sell or license the images to third parties for advertising without asking me first.
- Images will not be edited in a way that is misleading or embarrassing.
- I can withdraw permission for future use at any time by writing to {studio_name}. Images already printed or published can't be recalled.

Children
If the person photographed is under 18, a parent or guardian signs this release on their behalf and confirms they have the right to do so.

Signed online by {client_name} through Jovita."""

EMAILS = [
  ("Reply to a new inquiry", "Thank you for reaching out, {client_first_name}", True,
"""Hi {client_first_name},

Thank you so much for getting in touch! I'd love to hear more about your plans.

A few quick questions so I can put together the right quote:
- What date (or dates) do you have in mind?
- Where would you like the photos taken?
- Roughly how many people will be in the photos?

Once I know a bit more, I'll send a quote with everything included. Your date is only held once the deposit is paid, so it's good to move quickly on busy dates.

Speak soon,
{studio_name}"""),
  ("Quote is ready", "Your quote from {studio_name} is ready", False,
"""Hi {client_first_name},

Your quote for {project_title} is ready. You can see everything that's included and accept it here:
{portal_link}

Once you accept, it turns into an invoice so you can pay the deposit and your date is booked.

Any questions, just reply to this email.

Warm regards,
{studio_name}"""),
  ("Booking confirmed", "You're booked! See you on {session_date}", False,
"""Hi {client_first_name},

Your deposit is in and your date is booked: {session_date}. I can't wait!

Everything for your session (contract, payments and later your gallery) lives on your client page:
{portal_link}

I'll be in touch a week before with a short guide to help you prepare.

{studio_name}"""),
  ("How to prepare for your session", "Getting ready for your {project_type} session", False,
"""Hi {client_first_name},

Your session is coming up on {session_date}. Here are a few tips so you feel relaxed and look your best:

- Outfits: solid colours and soft patterns photograph best. Avoid big logos.
- Coordinate, don't match: pick 2 or 3 colours that work together for everyone.
- Rest and water: a good night's sleep and plenty of water really show.
- Bring: a hairbrush, any props that mean something to you, and snacks for little ones.
- Arrive 10 minutes early so we can start calmly.

If anything changes, just reply to this email.

See you soon,
{studio_name}"""),
  ("Your photos are ready", "Your photos are ready 🎉", False,
"""Hi {client_first_name},

Your gallery is ready! Open it here:
{portal_link}

Pick your favourites, download and share. The gallery stays open for 30 days, so download everything you want to keep.

It was a joy photographing you.
{studio_name}"""),
  ("Friendly payment reminder", "Reminder: invoice {invoice_number} is due {invoice_due}", False,
"""Hi {client_first_name},

Just a friendly reminder that invoice {invoice_number} for {invoice_amount} is due on {invoice_due}. You can pay here:
{portal_link}

If you've already paid, thank you, and please ignore this.

{studio_name}"""),
  ("Thank you and review request", "Thank you, {client_first_name}!", False,
"""Hi {client_first_name},

Thank you again for choosing {studio_name}. I hope you love your photos!

If you have a minute, a short review would mean the world to a small business like mine. A sentence or two about how the session felt is perfect.

And if friends or family are looking for a photographer, I'd be honoured if you passed on my name.

With gratitude,
{studio_name}"""),
]

def it(name, price, desc="", qty=1):
    return {"name": name, "description": desc, "qty": qty, "price": price}

PACKAGES = [
  ("Wedding · Full day", "NGN", True, "A 50% deposit books your date. The balance is due 7 days before the wedding.\nTravel outside the city is quoted separately.", [
    it("Full-day wedding coverage", 1500000, "- Lead photographer, up to 10 hours\n- Getting ready, ceremony and reception\n- Family and couple portraits"),
    it("Second photographer", 350000, "- Second angle on the ceremony\n- Guests and candid moments"),
    it("Online gallery", 0, "- 500+ edited photos\n- Preview in 7 days, full gallery in 8 weeks"),
    it("Pre-wedding session", 250000, "- 1 hour, 2 outfits\n- 30 edited photos", 0)]),
  ("Portrait session", "NGN", False, "Payment is due within 7 days. Extra retouched images can be added after you pick favourites.", [
    it("Portrait session", 150000, "- 1 hour in studio or outdoors\n- 2 outfits\n- Lead photographer"),
    it("Retouched images", 0, "- 10 fully retouched photos\n- Online proofing gallery"),
    it("Extra retouched image", 7500, "", 0)]),
  ("Family session", "NGN", False, "A 50% deposit books your date. The balance is due on the day of the session.", [
    it("Family session", 200000, "- 1.5 hours\n- Up to 6 people\n- Studio or outdoor location"),
    it("Online gallery", 0, "- 40 edited photos\n- Delivered in 21 days"),
    it("Extra family member", 15000, "", 0),
    it("Printed 8x10 photo", 20000, "", 0)]),
  ("Couple session", "NGN", False, "A 50% deposit books your date. Location fees, if any, are paid by you.", [
    it("Couple session", 180000, "- 1.5 hours\n- 2 locations, 2 outfits\n- Engagement, pre-wedding or anniversary"),
    it("Online gallery", 0, "- 50 edited photos\n- Sneak peek in 3 days"),
    it("Save-the-date design", 30000, "", 0)]),
]

def q(s):
    tag = "$jv$"
    assert tag not in s
    return tag + s + tag

rows = []
for name, default, body in CONTRACTS:
    rows.append(("contract", name, None, body, "[]", "NGN", default))
rows.append(("model_release", "Model release", None, RELEASE, "[]", "NGN", True))
for name, subject, default, body in EMAILS:
    rows.append(("email", name, subject, body, "[]", "NGN", default))
for name, cur, default, notes, items in PACKAGES:
    rows.append(("invoice", name, None, notes, json.dumps(items, ensure_ascii=False), cur, default))

values = ",\n".join(
    f"  ({q(k)}, {q(n)}, {('NULL' if s is None else q(s))}, {q(b)}, {q(i)}::jsonb, {q(c)}, {'true' if d else 'false'})"
    for k, n, s, b, i, c, d in rows)

sql = f"""-- ---------- Starter templates (contracts, model release, emails, packages) ----------
-- Real templates for photographers. New studios get them; existing studios get any they don't have yet (matched by name).
create or replace function public.starter_templates()
returns table (kind text, name text, subject text, body text, items jsonb, currency text, is_default boolean)
language sql immutable set search_path = '' as $fn$
  select * from (values
{values}
  ) as t(kind, name, subject, body, items, currency, is_default)
$fn$;

-- Adds the starter templates a studio doesn't have yet. A starter only becomes the default when the studio has no default of that kind.
create or replace function public.add_starter_templates(p_studio uuid)
returns integer language plpgsql security definer set search_path = '' as $fn$
declare n integer;
begin
  insert into public.templates (studio_id, kind, name, subject, body, items, currency, is_default)
  select p_studio, s.kind, s.name, s.subject, s.body, s.items, s.currency,
         s.is_default and not exists (select 1 from public.templates x where x.studio_id = p_studio and x.kind = s.kind and x.is_default)
    from public.starter_templates() s
   where not exists (select 1 from public.templates x where x.studio_id = p_studio and lower(x.name) = lower(s.name));
  get diagnostics n = row_count;
  return n;
end $fn$;
revoke all on function public.add_starter_templates(uuid) from public, anon, authenticated;

-- The app's "Add starter templates" button (only ever for your own studio)
create or replace function public.add_my_starter_templates()
returns integer language sql security definer set search_path = '' as $fn$
  select public.add_starter_templates(public.my_studio_id())
$fn$;
revoke all on function public.add_my_starter_templates() from public, anon;
grant execute on function public.add_my_starter_templates() to authenticated;

-- New sign-ups get the full set
create or replace function public.seed_templates(p_studio uuid)
returns void language plpgsql security definer set search_path = '' as $fn$
begin
  perform public.add_starter_templates(p_studio);
end $fn$;
revoke all on function public.seed_templates(uuid) from public, anon, authenticated;

-- Existing studios
select public.add_starter_templates(id) from public.studios;
"""
out = os.path.join(os.path.dirname(__file__), "starter_templates.sql")
open(out, "w").write(sql)
print("wrote", out, len(rows), "templates")
