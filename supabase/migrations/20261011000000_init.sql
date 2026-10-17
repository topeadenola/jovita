-- Jovita v1 schema: one studio per signed-up user; everything else belongs to a studio.

create table public.studios (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null unique references auth.users(id) on delete cascade,
  name text not null default 'My studio',
  owner_first_name text not null default '',
  slug text unique,
  home_currency text not null default 'NGN' check (home_currency in ('NGN','GBP','USD')),
  reminders_on boolean not null default true,
  remind_before boolean not null default true,
  remind_after boolean not null default true,
  whatsapp_on boolean not null default true,
  pay_paystack boolean not null default true,
  pay_flutterwave boolean not null default false,
  pay_stripe boolean not null default true,
  pay_transfer boolean not null default true,
  bank_details text not null default '',
  created_at timestamptz not null default now()
);

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references public.studios(id) on delete cascade,
  name text not null,
  email text,
  phone text,
  city text,
  status text not null default 'lead' check (status in ('lead','client')),
  created_at timestamptz not null default now()
);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references public.studios(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  title text not null,
  type text not null default 'Portrait',
  stage text not null default 'inquiry' check (stage in ('inquiry','booked','shooting','editing','delivered')),
  session_date date,
  amount numeric(14,2) not null default 0,
  currency text not null default 'NGN' check (currency in ('NGN','GBP','USD')),
  contract_signed boolean not null default false,
  contract_signed_name text,
  contract_signed_at timestamptz,
  deposit_paid boolean not null default false,
  gallery_delivered boolean not null default false,
  portal_token uuid not null unique default gen_random_uuid(),
  created_at timestamptz not null default now()
);

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references public.studios(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  number integer not null default 0,
  label text not null,
  amount numeric(14,2) not null check (amount >= 0),
  currency text not null default 'NGN' check (currency in ('NGN','GBP','USD')),
  due_date date not null default (current_date + 7),
  status text not null default 'draft' check (status in ('draft','sent','paid','cancelled')),
  paid_at timestamptz,
  payment_reported_at timestamptz,
  created_at timestamptz not null default now(),
  unique (studio_id, number)
);

create table public.session_types (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references public.studios(id) on delete cascade,
  name text not null,
  length_label text not null default '1 hour',
  price numeric(14,2) not null default 0,
  currency text not null default 'NGN' check (currency in ('NGN','GBP','USD')),
  availability text not null default 'Mon–Fri',
  created_at timestamptz not null default now()
);

create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references public.studios(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  title text not null,
  starts_at timestamptz not null,
  location text,
  created_at timestamptz not null default now()
);

create table public.galleries (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references public.studios(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  title text not null,
  status text not null default 'draft' check (status in ('draft','proofing','delivered')),
  photo_count integer not null default 0,
  favourites integer not null default 0,
  downloads integer not null default 0,
  expires_on date,
  created_at timestamptz not null default now()
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references public.studios(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  channel text not null default 'email' check (channel in ('email','whatsapp','portal')),
  from_client boolean not null default false,
  body text not null check (char_length(body) between 1 and 4000),
  read boolean not null default false,
  created_at timestamptz not null default now()
);

-- Indexes for the foreign keys we filter on
create index on public.clients (studio_id);
create index on public.projects (studio_id);
create index on public.projects (client_id);
create index on public.invoices (studio_id);
create index on public.invoices (client_id);
create index on public.invoices (project_id);
create index on public.session_types (studio_id);
create index on public.bookings (studio_id);
create index on public.bookings (client_id);
create index on public.bookings (project_id);
create index on public.galleries (studio_id);
create index on public.galleries (client_id);
create index on public.galleries (project_id);
create index on public.messages (studio_id);
create index on public.messages (client_id);

-- Which studio does the signed-in user own?
create or replace function public.my_studio_id()
returns uuid language sql stable security definer set search_path = '' as $$
  select id from public.studios where owner_id = (select auth.uid())
$$;
revoke all on function public.my_studio_id() from public, anon;
grant execute on function public.my_studio_id() to authenticated;

-- Row level security: owners see and change only their own studio's rows
alter table public.studios enable row level security;
create policy "owner reads studio" on public.studios for select to authenticated using (owner_id = (select auth.uid()));
create policy "owner updates studio" on public.studios for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

do $$
declare t text;
begin
  foreach t in array array['clients','projects','invoices','session_types','bookings','galleries','messages'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "studio rows" on public.%I for all to authenticated using (studio_id = (select public.my_studio_id())) with check (studio_id = (select public.my_studio_id()))', t);
  end loop;
end $$;

-- New sign-ups get a studio automatically
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.studios (owner_id, name, owner_first_name)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data->>'studio_name',''), 'My studio'),
    coalesce(nullif(new.raw_user_meta_data->>'first_name',''), split_part(new.email,'@',1))
  );
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Invoice numbers count up per studio, starting at 1001
create or replace function public.set_invoice_number()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.number is null or new.number = 0 then
    select coalesce(max(number), 1000) + 1 into new.number from public.invoices where studio_id = new.studio_id;
  end if;
  return new;
end $$;
create trigger invoice_number before insert on public.invoices
  for each row execute function public.set_invoice_number();

-- ---------- Client portal (no login; the secret link token is the key) ----------
create or replace function public.get_portal(p_token uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'project', jsonb_build_object('id', p.id, 'title', p.title, 'type', p.type, 'stage', p.stage, 'session_date', p.session_date,
       'amount', p.amount, 'currency', p.currency, 'contract_signed', p.contract_signed, 'deposit_paid', p.deposit_paid, 'gallery_delivered', p.gallery_delivered),
    'client', jsonb_build_object('name', c.name),
    'studio', jsonb_build_object('name', s.name, 'pay_paystack', s.pay_paystack, 'pay_flutterwave', s.pay_flutterwave, 'pay_stripe', s.pay_stripe, 'pay_transfer', s.pay_transfer, 'bank_details', s.bank_details),
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

create or replace function public.portal_sign_contract(p_token uuid, p_name text)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if char_length(trim(coalesce(p_name,''))) < 2 then raise exception 'Type your full name to sign'; end if;
  update public.projects set contract_signed = true, contract_signed_name = left(trim(p_name), 200), contract_signed_at = now(),
    stage = case when stage = 'inquiry' then 'booked' else stage end
  where portal_token = p_token and contract_signed = false;
  return found;
end $$;

create or replace function public.portal_report_payment(p_token uuid, p_invoice uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  update public.invoices i set payment_reported_at = now()
  from public.projects p
  where p.portal_token = p_token and i.project_id = p.id and i.id = p_invoice and i.status = 'sent';
  return found;
end $$;

create or replace function public.portal_send_message(p_token uuid, p_body text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare p record;
begin
  if char_length(trim(coalesce(p_body,''))) = 0 then raise exception 'Write a message first'; end if;
  select studio_id, client_id into p from public.projects where portal_token = p_token;
  if not found then return false; end if;
  insert into public.messages (studio_id, client_id, channel, from_client, body) values (p.studio_id, p.client_id, 'portal', true, left(trim(p_body), 4000));
  return true;
end $$;

revoke all on function public.get_portal(uuid) from public;
revoke all on function public.portal_sign_contract(uuid, text) from public;
revoke all on function public.portal_report_payment(uuid, uuid) from public;
revoke all on function public.portal_send_message(uuid, text) from public;
grant execute on function public.get_portal(uuid) to anon, authenticated;
grant execute on function public.portal_sign_contract(uuid, text) to anon, authenticated;
grant execute on function public.portal_report_payment(uuid, uuid) to anon, authenticated;
grant execute on function public.portal_send_message(uuid, text) to anon, authenticated;
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.set_invoice_number() from public, anon, authenticated;
