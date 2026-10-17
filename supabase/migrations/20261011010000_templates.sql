-- Editable templates: contracts, model releases, invoices, emails
create table public.templates (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references public.studios(id) on delete cascade,
  kind text not null check (kind in ('contract','model_release','invoice','email')),
  name text not null,
  subject text,
  body text not null default '',
  items jsonb not null default '[]'::jsonb,
  currency text not null default 'NGN' check (currency in ('NGN','GBP','USD')),
  is_default boolean not null default false,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index on public.templates (studio_id);
alter table public.templates enable row level security;
create policy "studio rows" on public.templates for all to authenticated
  using (studio_id = (select public.my_studio_id())) with check (studio_id = (select public.my_studio_id()));

alter table public.projects
  add column contract_template_id uuid references public.templates(id) on delete set null,
  add column release_template_id uuid references public.templates(id) on delete set null,
  add column release_signed boolean not null default false,
  add column release_signed_name text,
  add column release_signed_at timestamptz;
create index on public.projects (contract_template_id);
create index on public.projects (release_template_id);

-- Starter templates for a studio
create or replace function public.seed_templates(p_studio uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  insert into public.templates (studio_id, kind, name, body, is_default) values
  (p_studio, 'contract', 'Photography contract',
$c$This agreement is between {studio_name} ("the Photographer") and {client_name} ("the Client") for a {project_type} session on {session_date}.

1. Fee and deposit
The total fee is {project_amount}. A 50% deposit secures the date. The deposit is non-refundable within 14 days of the session. The balance is due before the gallery is delivered.

2. The session
The Photographer will arrive on time and prepared. If the Client is more than 30 minutes late, the session may be shortened.

3. Delivery
Edited images are delivered in an online gallery within 21 days of the session. The gallery stays open for 30 days.

4. Usage
The Client may print and share the images for personal use. The Photographer keeps the copyright and may use selected images in a portfolio, unless the Client opts out in writing.

5. Rescheduling and cancellation
The session can be moved once at no cost with at least 7 days' notice.

Signed online by the Client through Jovita.$c$, true),
  (p_studio, 'contract', 'Makeup and styling contract',
$c$This agreement is between {studio_name} and {client_name} for {project_type} services on {session_date}.

1. Fee: {project_amount}. A 50% deposit secures the booking.
2. Trial: one trial session is included before the event date.
3. Timing: the Client confirms the start time and location 7 days before.
4. Allergies: the Client tells us about any skin allergies or sensitivities before the session.
5. Cancellation: the deposit is non-refundable within 14 days of the booking date.$c$, false),
  (p_studio, 'model_release', 'Model release',
$c$I, {client_name}, give {studio_name} permission to use photographs and video of me taken on {session_date} for portfolio, website, social media and promotional use.

I understand that:
- I will not be paid for this use beyond the agreed session fee.
- {studio_name} will not sell the images to third parties for advertising without asking me first.
- I can withdraw permission for future use at any time by writing to {studio_name}.

If the person photographed is under 18, a parent or guardian signs on their behalf.$c$, true),
  (p_studio, 'email', 'Quote is ready', $e$Hi {client_first_name},

Your quote for {project_title} is ready. You can review it, sign the contract and pay your deposit here:
{portal_link}

Any questions, just reply to this email.

Warm regards,
{studio_name}$e$, true),
  (p_studio, 'email', 'Your photos are ready', $e$Hi {client_first_name},

Your gallery is ready! Open it here:
{portal_link}

Pick your favourites and download within 30 days.

{studio_name}$e$, false),
  (p_studio, 'email', 'Friendly payment reminder', $e$Hi {client_first_name},

Just a friendly reminder that invoice {invoice_number} for {invoice_amount} is due on {invoice_due}. You can pay here:
{portal_link}

Thank you!
{studio_name}$e$, false);

  update public.templates set subject = case name
      when 'Quote is ready' then 'Your quote from {studio_name} is ready'
      when 'Your photos are ready' then 'Your photos are ready 🎉'
      when 'Friendly payment reminder' then 'Reminder: invoice {invoice_number} is due {invoice_due}'
    end
  where studio_id = p_studio and kind = 'email';

  insert into public.templates (studio_id, kind, name, body, items, currency, is_default) values
  (p_studio, 'invoice', 'Studio portrait package', 'Thank you for choosing us. Payment is due within 7 days.',
    '[{"name":"Studio portrait session (2 hours)","qty":1,"price":140000},{"name":"15 edited images","qty":1,"price":60000},{"name":"Extra edited image","qty":0,"price":5000}]'::jsonb, 'NGN', true),
  (p_studio, 'invoice', 'Wedding film', 'A 50% deposit secures your date. The balance is due 14 days before the wedding.',
    '[{"name":"Full-day coverage","qty":1,"price":2400},{"name":"Highlight film (4–6 min)","qty":1,"price":600},{"name":"Second shooter","qty":1,"price":200}]'::jsonb, 'GBP', false);
end $$;
revoke all on function public.seed_templates(uuid) from public, anon, authenticated;

-- New sign-ups get a studio and starter templates
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare sid uuid;
begin
  insert into public.studios (owner_id, name, owner_first_name)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data->>'studio_name',''), 'My studio'),
    coalesce(nullif(new.raw_user_meta_data->>'first_name',''), split_part(new.email,'@',1))
  ) returning id into sid;
  perform public.seed_templates(sid);
  return new;
end $$;

-- Portal: include the contract and model release text
create or replace function public.get_portal(p_token uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'project', jsonb_build_object('id', p.id, 'title', p.title, 'type', p.type, 'stage', p.stage, 'session_date', p.session_date,
       'amount', p.amount, 'currency', p.currency, 'contract_signed', p.contract_signed, 'deposit_paid', p.deposit_paid,
       'gallery_delivered', p.gallery_delivered, 'release_signed', p.release_signed),
    'client', jsonb_build_object('name', c.name),
    'studio', jsonb_build_object('name', s.name, 'pay_paystack', s.pay_paystack, 'pay_flutterwave', s.pay_flutterwave, 'pay_stripe', s.pay_stripe, 'pay_transfer', s.pay_transfer, 'bank_details', s.bank_details),
    'contract', (select t.body from public.templates t where t.studio_id = p.studio_id and t.kind = 'contract'
                  and (t.id = p.contract_template_id or (p.contract_template_id is null and t.is_default)) order by (t.id = p.contract_template_id) desc limit 1),
    'release', (select t.body from public.templates t where t.studio_id = p.studio_id and t.kind = 'model_release'
                  and (t.id = p.release_template_id or (p.release_template_id is null and t.is_default)) order by (t.id = p.release_template_id) desc limit 1),
    'invoices', coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'number', i.number, 'label', i.label, 'amount', i.amount, 'currency', i.currency,
        'due_date', i.due_date, 'status', i.status, 'payment_reported_at', i.payment_reported_at) order by i.due_date)
        from public.invoices i where i.project_id = p.id and i.status in ('sent','paid')), '[]'::jsonb),
    'booking', (select jsonb_build_object('starts_at', b.starts_at, 'location', b.location) from public.bookings b where b.project_id = p.id order by b.starts_at limit 1),
    'gallery', (select jsonb_build_object('title', g.title, 'photo_count', g.photo_count, 'status', g.status) from public.galleries g where g.project_id = p.id and g.status = 'delivered' limit 1)
  )
  from public.projects p
  join public.clients c on c.id = p.client_id
  join public.studios s on s.id = p.studio_id
  where p.portal_token = p_token
$$;

create or replace function public.portal_sign_release(p_token uuid, p_name text)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if char_length(trim(coalesce(p_name,''))) < 2 then raise exception 'Type your full name to sign'; end if;
  update public.projects set release_signed = true, release_signed_name = left(trim(p_name), 200), release_signed_at = now()
  where portal_token = p_token and release_signed = false;
  return found;
end $$;
revoke all on function public.portal_sign_release(uuid, text) from public;
grant execute on function public.portal_sign_release(uuid, text) to anon, authenticated;
