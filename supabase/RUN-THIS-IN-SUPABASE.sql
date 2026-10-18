-- Jovita updates 8 and 9: quotes, part payments, "Viewed" tracking, storage limits, logo fix, ready-made templates,
-- monthly or yearly plans, client favourites and comments on photos, videos in galleries, and client emails in your Inbox.
-- Paste all of this into Supabase › SQL Editor › New query, then press Run. Safe to run more than once.


-- ---------- Invoices: quotes, part payments, seen by the client ----------
alter table public.invoices add column if not exists kind text not null default 'invoice';
alter table public.invoices drop constraint if exists invoices_kind_check;
alter table public.invoices add constraint invoices_kind_check check (kind in ('invoice', 'quote'));
alter table public.invoices add column if not exists accepted_at timestamptz;        -- quote accepted by the client
alter table public.invoices add column if not exists viewed_at timestamptz;          -- first time the client opened it
alter table public.invoices add column if not exists amount_paid numeric not null default 0;
alter table public.invoices add column if not exists payments jsonb not null default '[]'::jsonb; -- [{ "amount": 50000, "date": "2026-10-18", "method": "Bank transfer", "note": "" }]
alter table public.projects add column if not exists portal_viewed_at timestamptz;

-- ---------- Storage: photo sizes, so plans can have a storage limit ----------
alter table public.gallery_photos add column if not exists bytes bigint not null default 0;

-- Bytes used by the signed-in studio, and its plan's limit (null = unlimited)
create or replace function public.storage_quota()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'used', coalesce((select sum(bytes) from public.gallery_photos where studio_id = s.id), 0),
    'limit', case when s.plan = 'studio' then null
                  when s.plan = 'pro' or s.plan_status = 'trialing' then 1000::bigint * 1024 * 1024 * 1024
                  else 500::bigint * 1024 * 1024 end,
    'plan', coalesce(s.plan, 'free'))
  from public.studios s where s.id = public.my_studio_id()
$$;
revoke all on function public.storage_quota() from public, anon;
grant execute on function public.storage_quota() to authenticated;

-- RAW files (Studio plan): allow them in the gallery bucket
update storage.buckets
   set file_size_limit = 157286400, -- 150 MB, enough for most RAW files
       allowed_mime_types = array['image/jpeg','image/png','image/webp','image/heic','image/heif',
         'image/x-canon-cr2','image/x-canon-cr3','image/x-nikon-nef','image/x-sony-arw','image/x-adobe-dng','image/x-fuji-raf','image/x-panasonic-rw2','image/x-olympus-orf','application/octet-stream']
 where id = 'gallery-photos';

-- ---------- Client portal ----------
-- The portal now includes quotes and part payments
create or replace function public.get_portal(p_token uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'project', jsonb_build_object('id', p.id, 'title', p.title, 'type', p.type, 'stage', p.stage, 'session_date', p.session_date,
       'amount', p.amount, 'currency', p.currency, 'contract_signed', p.contract_signed, 'deposit_paid', p.deposit_paid,
       'gallery_delivered', p.gallery_delivered, 'release_signed', p.release_signed),
    'client', jsonb_build_object('name', c.name, 'email', c.email),
    'studio', jsonb_build_object('name', s.name, 'logo_path', s.logo_path, 'pay_paystack', s.pay_paystack, 'pay_flutterwave', s.pay_flutterwave, 'pay_stripe', s.pay_stripe, 'pay_paypal', s.pay_paypal, 'pay_transfer', s.pay_transfer, 'bank_details', s.bank_details),
    'payments', coalesce((select jsonb_agg(jsonb_build_object('provider', a.provider, 'label', a.label, 'public_key', a.public_key, 'details', a.details) order by a.connected_at)
        from public.payment_accounts a where a.studio_id = p.studio_id and a.enabled), '[]'::jsonb),
    'contract', (select t.body from public.templates t where t.studio_id = p.studio_id and t.kind = 'contract'
                  and (t.id = p.contract_template_id or (p.contract_template_id is null and t.is_default)) order by (t.id = p.contract_template_id) desc limit 1),
    'release', (select t.body from public.templates t where t.studio_id = p.studio_id and t.kind = 'model_release'
                  and (t.id = p.release_template_id or (p.release_template_id is null and t.is_default)) order by (t.id = p.release_template_id) desc limit 1),
    'invoices', coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'number', i.number, 'label', i.label, 'amount', i.amount, 'currency', i.currency,
        'due_date', i.due_date, 'status', i.status, 'payment_reported_at', i.payment_reported_at, 'items', i.items, 'notes', i.notes, 'methods', i.methods,
        'kind', i.kind, 'accepted_at', i.accepted_at, 'amount_paid', i.amount_paid) order by i.due_date)
        from public.invoices i where i.project_id = p.id and i.status in ('sent','paid')), '[]'::jsonb),
    'booking', (select jsonb_build_object('starts_at', b.starts_at, 'location', b.location) from public.bookings b where b.project_id = p.id order by b.starts_at limit 1),
    'gallery', (select jsonb_build_object('title', g.title, 'photo_count', g.photo_count, 'status', g.status, 'share_token', g.share_token) from public.galleries g where g.project_id = p.id and g.status = 'delivered' limit 1)
  )
  from public.projects p
  join public.clients c on c.id = p.client_id
  join public.studios s on s.id = p.studio_id
  where p.portal_token = p_token
$$;

-- Called when the client opens their page: marks what they've seen so the studio knows
create or replace function public.portal_seen(p_token uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare pid uuid; sid uuid;
begin
  select id, studio_id into pid, sid from public.projects where portal_token = p_token;
  if pid is null then return; end if;
  update public.projects set portal_viewed_at = now() where id = pid;
  update public.invoices set viewed_at = now() where project_id = pid and status = 'sent' and viewed_at is null;
end $$;
revoke all on function public.portal_seen(uuid) from public;
grant execute on function public.portal_seen(uuid) to anon, authenticated;

-- The client accepts a quote: it becomes an invoice to pay, and the project is booked
create or replace function public.portal_accept_quote(p_token uuid, p_invoice uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare pid uuid; cid uuid;
begin
  select id, client_id into pid, cid from public.projects where portal_token = p_token;
  if pid is null then return false; end if;
  update public.invoices
     set kind = 'invoice', accepted_at = now(), status = 'sent', viewed_at = coalesce(viewed_at, now()),
         due_date = greatest(coalesce(due_date, current_date), current_date + 3)
   where id = p_invoice and project_id = pid and kind = 'quote' and status = 'sent';
  if not found then return false; end if;
  update public.projects set stage = case when stage = 'inquiry' then 'booked' else stage end where id = pid;
  update public.clients set status = 'client' where id = cid;
  return true;
end $$;
revoke all on function public.portal_accept_quote(uuid, uuid) from public;
grant execute on function public.portal_accept_quote(uuid, uuid) to anon, authenticated;

-- Password page now shows the cover photo and studio logo behind the padlock
create or replace function public.open_gallery(p_token uuid, p_password text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  g public.galleries;
  inv public.gallery_invites;
  pw text;
begin
  select * into inv from public.gallery_invites where token = p_token;
  if found then
    select * into g from public.galleries where id = inv.gallery_id;
  else
    select * into g from public.galleries where share_token = p_token;
  end if;
  if g.id is null then return null; end if;
  if g.status <> 'delivered' then return jsonb_build_object('error', 'not_published'); end if;
  if g.expires_on is not null and g.expires_on < current_date then return jsonb_build_object('error', 'expired'); end if;
  pw := nullif(g.settings->>'password', '');
  if pw is not null and coalesce(p_password, '') <> pw then
    return jsonb_build_object('error', 'password', 'title', g.title, 'event_date', g.event_date,
      'cover_path', coalesce(g.cover_path, (select p.path from public.gallery_photos p where p.gallery_id = g.id order by p.position limit 1)),
      'studio', (select jsonb_build_object('name', s.name, 'logo_path', s.logo_path) from public.studios s where s.id = g.studio_id));
  end if;
  if inv.id is not null then
    update public.gallery_invites
      set views = views + 1, last_viewed_at = now(), first_viewed_at = coalesce(first_viewed_at, now())
      where id = inv.id;
  end if;
  return jsonb_build_object(
    'title', g.title, 'event_date', g.event_date, 'cover_path', g.cover_path, 'sets', g.sets, 'design', g.design,
    'download', (g.settings->'download') - 'pin', 'favorite', g.settings->'favorite',
    'studio', (select jsonb_build_object('name', s.name, 'logo_path', s.logo_path) from public.studios s where s.id = g.studio_id),
    'viewer', case when inv.id is not null then jsonb_build_object('email', inv.email, 'name', inv.name) else null end,
    'photos', coalesce((select jsonb_agg(jsonb_build_object('path', p.path, 'set_id', p.set_id, 'width', p.width, 'height', p.height) order by p.position)
      from public.gallery_photos p where p.gallery_id = g.id), '[]'::jsonb)
  );
end $$;

-- ---------- Studio preference: send me a copy of client emails ----------
alter table public.studios add column if not exists copy_me boolean not null default false;

-- ---------- Storage: let a studio see its own files ----------
-- Replacing or deleting a file (logo, gallery photos) needs a read policy too. Without it, logo uploads and photo deletes fail.
drop policy if exists "studio reads assets" on storage.objects;
create policy "studio reads assets" on storage.objects for select to authenticated
  using (bucket_id = 'studio-assets' and (storage.foldername(name))[1] = (select public.my_studio_id())::text);
drop policy if exists "studio reads gallery photos" on storage.objects;
create policy "studio reads gallery photos" on storage.objects for select to authenticated
  using (bucket_id = 'gallery-photos' and (storage.foldername(name))[1] = (select public.my_studio_id())::text);

-- ---------- Studio: where client replies go (empty = the sign-in email) ----------
alter table public.studios add column if not exists reply_email text;
alter table public.invoices add column if not exists accept_emailed_at timestamptz; -- so the "quote accepted" emails go out only once
-- ---------- Starter templates (contracts, model release, emails, packages) ----------
-- Real templates for photographers. New studios get them; existing studios get any they don't have yet (matched by name).
create or replace function public.starter_templates()
returns table (kind text, name text, subject text, body text, items jsonb, currency text, is_default boolean)
language sql immutable set search_path = '' as $fn$
  select * from (values
  ($jv$contract$jv$, $jv$Wedding photography contract$jv$, NULL, $jv$This agreement is between {studio_name} ("the Photographer") and {client_name} ("the Client") for wedding photography on {session_date}.

1. Fee and deposit
The total fee is {project_amount}. A non-refundable deposit of 50% secures the date; the date is not held until it is paid. The balance is due 7 days before the session unless the invoice says otherwise. Payments are made through the client page or by bank transfer.

2. Late payment
If the balance is not paid on time, {studio_name} may hold the delivery of images until it is paid.

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

Signatures
Signed online by {client_name} through Jovita. A typed name and a ticked box count as a signature, and both parties get a copy.
This contract is a starting point and not legal advice. {studio_name} should check it suits local law.$jv$, $jv$[]$jv$::jsonb, $jv$NGN$jv$, true),
  ($jv$contract$jv$, $jv$Portrait session contract$jv$, NULL, $jv$This agreement is between {studio_name} ("the Photographer") and {client_name} ("the Client") for a portrait session on {session_date}.

1. Fee and deposit
The total fee is {project_amount}. A non-refundable deposit of 50% secures the date; the date is not held until it is paid. The balance is due 7 days before the session unless the invoice says otherwise. Payments are made through the client page or by bank transfer.

2. Late payment
If the balance is not paid on time, {studio_name} may hold the delivery of images until it is paid.

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

Signatures
Signed online by {client_name} through Jovita. A typed name and a ticked box count as a signature, and both parties get a copy.
This contract is a starting point and not legal advice. {studio_name} should check it suits local law.$jv$, $jv$[]$jv$::jsonb, $jv$NGN$jv$, true),
  ($jv$contract$jv$, $jv$Family session contract$jv$, NULL, $jv$This agreement is between {studio_name} ("the Photographer") and {client_name} ("the Client") for a family photography session on {session_date}.

1. Fee and deposit
The total fee is {project_amount}. A non-refundable deposit of 50% secures the date; the date is not held until it is paid. The balance is due 7 days before the session unless the invoice says otherwise. Payments are made through the client page or by bank transfer.

2. Late payment
If the balance is not paid on time, {studio_name} may hold the delivery of images until it is paid.

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

Signatures
Signed online by {client_name} through Jovita. A typed name and a ticked box count as a signature, and both parties get a copy.
This contract is a starting point and not legal advice. {studio_name} should check it suits local law.$jv$, $jv$[]$jv$::jsonb, $jv$NGN$jv$, false),
  ($jv$contract$jv$, $jv$Couple session contract$jv$, NULL, $jv$This agreement is between {studio_name} ("the Photographer") and {client_name} ("the Client") for a couple session (engagement, pre-wedding or anniversary) on {session_date}.

1. Fee and deposit
The total fee is {project_amount}. A non-refundable deposit of 50% secures the date; the date is not held until it is paid. The balance is due 7 days before the session unless the invoice says otherwise. Payments are made through the client page or by bank transfer.

2. Late payment
If the balance is not paid on time, {studio_name} may hold the delivery of images until it is paid.

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

Signatures
Signed online by {client_name} through Jovita. A typed name and a ticked box count as a signature, and both parties get a copy.
This contract is a starting point and not legal advice. {studio_name} should check it suits local law.$jv$, $jv$[]$jv$::jsonb, $jv$NGN$jv$, false),
  ($jv$model_release$jv$, $jv$Model release$jv$, NULL, $jv$Model release

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

Signed online by {client_name} through Jovita.$jv$, $jv$[]$jv$::jsonb, $jv$NGN$jv$, true),
  ($jv$email$jv$, $jv$Reply to a new inquiry$jv$, $jv$Thank you for reaching out, {client_first_name}$jv$, $jv$Hi {client_first_name},

Thank you so much for getting in touch! I'd love to hear more about your plans.

A few quick questions so I can put together the right quote:
- What date (or dates) do you have in mind?
- Where would you like the photos taken?
- Roughly how many people will be in the photos?

Once I know a bit more, I'll send a quote with everything included. Your date is only held once the deposit is paid, so it's good to move quickly on busy dates.

Speak soon,
{studio_name}$jv$, $jv$[]$jv$::jsonb, $jv$NGN$jv$, true),
  ($jv$email$jv$, $jv$Quote is ready$jv$, $jv$Your quote from {studio_name} is ready$jv$, $jv$Hi {client_first_name},

Your quote for {project_title} is ready. You can see everything that's included and accept it here:
{portal_link}

Once you accept, it turns into an invoice so you can pay the deposit and your date is booked.

Any questions, just reply to this email.

Warm regards,
{studio_name}$jv$, $jv$[]$jv$::jsonb, $jv$NGN$jv$, false),
  ($jv$email$jv$, $jv$Booking confirmed$jv$, $jv$You're booked! See you on {session_date}$jv$, $jv$Hi {client_first_name},

Your deposit is in and your date is booked: {session_date}. I can't wait!

Everything for your session (contract, payments and later your gallery) lives on your client page:
{portal_link}

I'll be in touch a week before with a short guide to help you prepare.

{studio_name}$jv$, $jv$[]$jv$::jsonb, $jv$NGN$jv$, false),
  ($jv$email$jv$, $jv$How to prepare for your session$jv$, $jv$Getting ready for your {project_type} session$jv$, $jv$Hi {client_first_name},

Your session is coming up on {session_date}. Here are a few tips so you feel relaxed and look your best:

- Outfits: solid colours and soft patterns photograph best. Avoid big logos.
- Coordinate, don't match: pick 2 or 3 colours that work together for everyone.
- Rest and water: a good night's sleep and plenty of water really show.
- Bring: a hairbrush, any props that mean something to you, and snacks for little ones.
- Arrive 10 minutes early so we can start calmly.

If anything changes, just reply to this email.

See you soon,
{studio_name}$jv$, $jv$[]$jv$::jsonb, $jv$NGN$jv$, false),
  ($jv$email$jv$, $jv$Your photos are ready$jv$, $jv$Your photos are ready 🎉$jv$, $jv$Hi {client_first_name},

Your gallery is ready! Open it here:
{portal_link}

Pick your favourites, download and share. The gallery stays open for 30 days, so download everything you want to keep.

It was a joy photographing you.
{studio_name}$jv$, $jv$[]$jv$::jsonb, $jv$NGN$jv$, false),
  ($jv$email$jv$, $jv$Friendly payment reminder$jv$, $jv$Reminder: invoice {invoice_number} is due {invoice_due}$jv$, $jv$Hi {client_first_name},

Just a friendly reminder that invoice {invoice_number} for {invoice_amount} is due on {invoice_due}. You can pay here:
{portal_link}

If you've already paid, thank you, and please ignore this.

{studio_name}$jv$, $jv$[]$jv$::jsonb, $jv$NGN$jv$, false),
  ($jv$email$jv$, $jv$Thank you and review request$jv$, $jv$Thank you, {client_first_name}!$jv$, $jv$Hi {client_first_name},

Thank you again for choosing {studio_name}. I hope you love your photos!

If you have a minute, a short review would mean the world to a small business like mine. A sentence or two about how the session felt is perfect.

And if friends or family are looking for a photographer, I'd be honoured if you passed on my name.

With gratitude,
{studio_name}$jv$, $jv$[]$jv$::jsonb, $jv$NGN$jv$, false),
  ($jv$invoice$jv$, $jv$Wedding · Full day$jv$, NULL, $jv$A 50% deposit books your date. The balance is due 7 days before the wedding.
Travel outside the city is quoted separately.$jv$, $jv$[{"name": "Full-day wedding coverage", "description": "- Lead photographer, up to 10 hours\n- Getting ready, ceremony and reception\n- Family and couple portraits", "qty": 1, "price": 1500000}, {"name": "Second photographer", "description": "- Second angle on the ceremony\n- Guests and candid moments", "qty": 1, "price": 350000}, {"name": "Online gallery", "description": "- 500+ edited photos\n- Preview in 7 days, full gallery in 8 weeks", "qty": 1, "price": 0}, {"name": "Pre-wedding session", "description": "- 1 hour, 2 outfits\n- 30 edited photos", "qty": 0, "price": 250000}]$jv$::jsonb, $jv$NGN$jv$, true),
  ($jv$invoice$jv$, $jv$Portrait session$jv$, NULL, $jv$Payment is due within 7 days. Extra retouched images can be added after you pick favourites.$jv$, $jv$[{"name": "Portrait session", "description": "- 1 hour in studio or outdoors\n- 2 outfits\n- Lead photographer", "qty": 1, "price": 150000}, {"name": "Retouched images", "description": "- 10 fully retouched photos\n- Online proofing gallery", "qty": 1, "price": 0}, {"name": "Extra retouched image", "description": "", "qty": 0, "price": 7500}]$jv$::jsonb, $jv$NGN$jv$, false),
  ($jv$invoice$jv$, $jv$Family session$jv$, NULL, $jv$A 50% deposit books your date. The balance is due on the day of the session.$jv$, $jv$[{"name": "Family session", "description": "- 1.5 hours\n- Up to 6 people\n- Studio or outdoor location", "qty": 1, "price": 200000}, {"name": "Online gallery", "description": "- 40 edited photos\n- Delivered in 21 days", "qty": 1, "price": 0}, {"name": "Extra family member", "description": "", "qty": 0, "price": 15000}, {"name": "Printed 8x10 photo", "description": "", "qty": 0, "price": 20000}]$jv$::jsonb, $jv$NGN$jv$, false),
  ($jv$invoice$jv$, $jv$Couple session$jv$, NULL, $jv$A 50% deposit books your date. Location fees, if any, are paid by you.$jv$, $jv$[{"name": "Couple session", "description": "- 1.5 hours\n- 2 locations, 2 outfits\n- Engagement, pre-wedding or anniversary", "qty": 1, "price": 180000}, {"name": "Online gallery", "description": "- 50 edited photos\n- Sneak peek in 3 days", "qty": 1, "price": 0}, {"name": "Save-the-date design", "description": "", "qty": 0, "price": 30000}]$jv$::jsonb, $jv$NGN$jv$, false)
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

-- ---------- Pay monthly or yearly (yearly saves 5%) ----------
alter table public.studios add column if not exists plan_cycle text not null default 'month';
alter table public.studios drop constraint if exists studios_plan_cycle_check;
alter table public.studios add constraint studios_plan_cycle_check check (plan_cycle in ('month', 'year'));

-- Same as request_upgrade, plus how they want to pay. HQ sees "monthly" or "yearly" in the request.
create or replace function public.request_plan(p_plan text, p_cycle text default 'month')
returns void language plpgsql security definer set search_path = '' as $$
declare s record; up boolean; cur text; cyc text;
begin
  if p_plan not in ('free', 'pro', 'studio') then raise exception 'Unknown plan'; end if;
  cyc := case when p_cycle = 'year' then 'year' else 'month' end;
  select id, name, plan, plan_status, plan_cycle into s from public.studios where id = public.my_studio_id();
  if s.id is null then raise exception 'No studio'; end if;
  cur := case when s.plan_status = 'trialing' then 'free' else s.plan end;
  if p_plan = cur and cyc = s.plan_cycle then return; end if;
  up := array_position(array['free','pro','studio'], p_plan) >= array_position(array['free','pro','studio'], cur);
  if exists (select 1 from public.events where studio_id = s.id and kind in ('upgrade_request', 'downgrade_request') and meta->>'plan' = p_plan and meta->>'cycle' = cyc and created_at > now() - interval '1 day') then return; end if;
  insert into public.events (studio_id, kind, meta) values (s.id, case when up then 'upgrade_request' else 'downgrade_request' end, jsonb_build_object('plan', p_plan, 'from', cur, 'cycle', cyc));
  insert into public.admin_notifications (kind, title, body, studio_id)
  values (case when up then 'upgrade_request' else 'downgrade_request' end, case when up then 'Wants to upgrade' else 'Wants to downgrade' end,
          coalesce(s.name, 'A studio') || ' asked to move from ' || initcap(cur) || case when s.plan_status = 'trialing' then ' (on a Pro trial)' else '' end
          || ' to ' || initcap(p_plan) || case when p_plan <> 'free' then ', paid ' || case when cyc = 'year' then 'yearly (5% off)' else 'monthly' end else '' end, s.id);
end $$;
revoke all on function public.request_plan(text, text) from public, anon;
grant execute on function public.request_plan(text, text) to authenticated;


-- ---------- Favourites (a client's picks) ----------
create table if not exists public.gallery_favorites (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references public.studios(id) on delete cascade,
  gallery_id uuid not null references public.galleries(id) on delete cascade,
  photo_id uuid not null references public.gallery_photos(id) on delete cascade,
  viewer text not null,                    -- the client's email, or a private id kept in their browser
  viewer_name text not null default '',
  created_at timestamptz not null default now(),
  unique (photo_id, viewer)
);
create index if not exists gallery_favorites_gallery_idx on public.gallery_favorites (gallery_id);
create index if not exists gallery_favorites_studio_idx on public.gallery_favorites (studio_id);
alter table public.gallery_favorites enable row level security;
drop policy if exists "studio rows" on public.gallery_favorites;
create policy "studio rows" on public.gallery_favorites for all to authenticated
  using (studio_id = (select public.my_studio_id())) with check (studio_id = (select public.my_studio_id()));

-- ---------- Comments on a photo (what to edit), both ways ----------
create table if not exists public.gallery_comments (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references public.studios(id) on delete cascade,
  gallery_id uuid not null references public.galleries(id) on delete cascade,
  photo_id uuid not null references public.gallery_photos(id) on delete cascade,
  from_client boolean not null default true,
  author text not null default '',
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index if not exists gallery_comments_gallery_idx on public.gallery_comments (gallery_id);
create index if not exists gallery_comments_studio_idx on public.gallery_comments (studio_id);
alter table public.gallery_comments enable row level security;
drop policy if exists "studio rows" on public.gallery_comments;
create policy "studio rows" on public.gallery_comments for all to authenticated
  using (studio_id = (select public.my_studio_id())) with check (studio_id = (select public.my_studio_id()));

-- The gallery behind a client link, only if it's open to them (published, not expired, right password)
create or replace function public.gallery_check(p_token uuid, p_password text)
returns public.galleries language plpgsql stable security definer set search_path = '' as $$
declare g public.galleries; inv public.gallery_invites; pw text;
begin
  select * into inv from public.gallery_invites where token = p_token;
  if found then select * into g from public.galleries where id = inv.gallery_id;
  else select * into g from public.galleries where share_token = p_token; end if;
  if g.id is null or g.status <> 'delivered' or (g.expires_on is not null and g.expires_on < current_date) then return null; end if;
  pw := nullif(g.settings->>'password', '');
  if pw is not null and coalesce(p_password, '') <> pw then return null; end if;
  return g;
end $$;
revoke all on function public.gallery_check(uuid, text) from public, anon, authenticated;

-- The client's own picks, and every comment on the gallery
create or replace function public.gallery_feedback(p_token uuid, p_password text, p_viewer text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare g public.galleries;
begin
  g := public.gallery_check(p_token, p_password);
  if g.id is null then return null; end if;
  return jsonb_build_object(
    'favorites', coalesce((select jsonb_agg(f.photo_id) from public.gallery_favorites f where f.gallery_id = g.id and f.viewer = left(coalesce(p_viewer, ''), 200)), '[]'::jsonb),
    'comments', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'photo_id', c.photo_id, 'from_client', c.from_client, 'author', c.author, 'body', c.body, 'created_at', c.created_at) order by c.created_at)
       from public.gallery_comments c where c.gallery_id = g.id), '[]'::jsonb));
end $$;
revoke all on function public.gallery_feedback(uuid, text, text) from public;
grant execute on function public.gallery_feedback(uuid, text, text) to anon, authenticated;

-- Heart or un-heart a photo. Returns true when it's now a favourite.
create or replace function public.gallery_toggle_favorite(p_token uuid, p_password text, p_photo uuid, p_viewer text, p_name text default '')
returns boolean language plpgsql security definer set search_path = '' as $$
declare g public.galleries; v text := left(coalesce(p_viewer, ''), 200);
begin
  g := public.gallery_check(p_token, p_password);
  if g.id is null or length(v) < 3 then raise exception 'This gallery is not available.'; end if;
  if coalesce((g.settings->'favorite'->>'on')::boolean, true) = false then raise exception 'Favourites are switched off for this gallery.'; end if;
  if not exists (select 1 from public.gallery_photos p where p.id = p_photo and p.gallery_id = g.id) then raise exception 'Photo not found.'; end if;
  delete from public.gallery_favorites where photo_id = p_photo and viewer = v;
  if found then
    update public.galleries set favourites = greatest(0, favourites - 1) where id = g.id;
    return false;
  end if;
  insert into public.gallery_favorites (studio_id, gallery_id, photo_id, viewer, viewer_name)
  values (g.studio_id, g.id, p_photo, v, left(coalesce(p_name, ''), 80));
  update public.galleries set favourites = favourites + 1 where id = g.id;
  return true;
end $$;
revoke all on function public.gallery_toggle_favorite(uuid, text, uuid, text, text) from public;
grant execute on function public.gallery_toggle_favorite(uuid, text, uuid, text, text) to anon, authenticated;

-- A client comments on a photo. It also lands in the studio's Inbox so nothing is missed.
create or replace function public.gallery_add_comment(p_token uuid, p_password text, p_photo uuid, p_viewer text, p_name text, p_body text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare g public.galleries; ph public.gallery_photos; c public.gallery_comments; b text := btrim(coalesce(p_body, ''));
begin
  g := public.gallery_check(p_token, p_password);
  if g.id is null then raise exception 'This gallery is not available.'; end if;
  if b = '' then raise exception 'Write a comment first.'; end if;
  select * into ph from public.gallery_photos where id = p_photo and gallery_id = g.id;
  if ph.id is null then raise exception 'Photo not found.'; end if;
  if (select count(*) from public.gallery_comments where gallery_id = g.id and from_client and created_at > now() - interval '10 minutes') >= 40 then
    raise exception 'Too many comments at once. Please wait a few minutes.';
  end if;
  insert into public.gallery_comments (studio_id, gallery_id, photo_id, from_client, author, body)
  values (g.studio_id, g.id, ph.id, true, left(coalesce(nullif(btrim(p_name), ''), 'Client'), 80), left(b, 2000))
  returning * into c;
  if g.client_id is not null then
    insert into public.messages (studio_id, client_id, channel, from_client, read, body)
    values (g.studio_id, g.client_id, 'portal', true, false,
            left('Comment on ' || coalesce(nullif(ph.name, ''), 'a photo') || ' in "' || coalesce(g.title, 'your gallery') || '": ' || b, 4000));
  end if;
  return jsonb_build_object('id', c.id, 'photo_id', c.photo_id, 'from_client', true, 'author', c.author, 'body', c.body, 'created_at', c.created_at);
end $$;
revoke all on function public.gallery_add_comment(uuid, text, uuid, text, text, text) from public;
grant execute on function public.gallery_add_comment(uuid, text, uuid, text, text, text) to anon, authenticated;

-- Photos with a light preview copy (older uploads get one made in the background)
alter table public.gallery_photos add column if not exists has_thumb boolean not null default false;

-- The client gallery now includes each photo's id and original file name (so picks match the files on your computer)
create or replace function public.open_gallery(p_token uuid, p_password text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  g public.galleries;
  inv public.gallery_invites;
  pw text;
begin
  select * into inv from public.gallery_invites where token = p_token;
  if found then
    select * into g from public.galleries where id = inv.gallery_id;
  else
    select * into g from public.galleries where share_token = p_token;
  end if;
  if g.id is null then return null; end if;
  if g.status <> 'delivered' then return jsonb_build_object('error', 'not_published'); end if;
  if g.expires_on is not null and g.expires_on < current_date then return jsonb_build_object('error', 'expired'); end if;
  pw := nullif(g.settings->>'password', '');
  if pw is not null and coalesce(p_password, '') <> pw then
    return jsonb_build_object('error', 'password', 'title', g.title, 'event_date', g.event_date,
      'cover_path', coalesce(g.cover_path, (select p.path from public.gallery_photos p where p.gallery_id = g.id order by p.position limit 1)),
      'studio', (select jsonb_build_object('name', s.name, 'logo_path', s.logo_path) from public.studios s where s.id = g.studio_id));
  end if;
  if inv.id is not null then
    update public.gallery_invites
      set views = views + 1, last_viewed_at = now(), first_viewed_at = coalesce(first_viewed_at, now())
      where id = inv.id;
  end if;
  return jsonb_build_object(
    'title', g.title, 'event_date', g.event_date, 'cover_path', g.cover_path, 'sets', g.sets, 'design', g.design,
    'download', (g.settings->'download') - 'pin', 'favorite', g.settings->'favorite',
    'studio', (select jsonb_build_object('name', s.name, 'logo_path', s.logo_path) from public.studios s where s.id = g.studio_id),
    'viewer', case when inv.id is not null then jsonb_build_object('email', inv.email, 'name', inv.name) else null end,
    'photos', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'path', p.path, 'name', p.name, 'set_id', p.set_id, 'width', p.width, 'height', p.height, 'has_thumb', p.has_thumb) order by p.position)
      from public.gallery_photos p where p.gallery_id = g.id), '[]'::jsonb)
  );
end $$;

-- ---------- Videos in galleries ----------
update storage.buckets
   set file_size_limit = 524288000, -- 500 MB per file (photos, RAW and short films)
       allowed_mime_types = array['image/jpeg','image/png','image/webp','image/heic','image/heif',
         'image/x-canon-cr2','image/x-canon-cr3','image/x-nikon-nef','image/x-sony-arw','image/x-adobe-dng','image/x-fuji-raf','image/x-panasonic-rw2','image/x-olympus-orf',
         'video/mp4','video/quicktime','video/webm','video/x-m4v','application/octet-stream']
 where id = 'gallery-photos';

-- ---------- Client emails in the Jovita inbox ----------
-- Each studio gets a private address (inbox+<code>@getjovita.com). Client emails sent there land in Inbox like a chat.
alter table public.studios add column if not exists inbox_code text;
update public.studios set inbox_code = lower(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)) where inbox_code is null;
alter table public.studios alter column inbox_code set default lower(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
create unique index if not exists studios_inbox_code_idx on public.studios (inbox_code);
alter table public.studios add column if not exists forward_inbox boolean not null default true; -- also send a copy to the creative's own email
alter table public.messages add column if not exists subject text;
alter table public.messages add column if not exists email_id text;
