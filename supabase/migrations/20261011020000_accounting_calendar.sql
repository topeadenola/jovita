-- Jovita: accounting (expenses + subscriptions) and Google Calendar two-way sync.

-- ---------- Accounting ----------
create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references public.studios(id) on delete cascade,
  spent_on date not null default current_date,
  vendor text not null,
  category text not null default 'Other' check (category in (
    'Software and subscriptions','Equipment','Travel','Studio and rent','Props and wardrobe',
    'Crew and assistants','Marketing','Printing and albums','Fees and bank charges','Other')),
  amount numeric(14,2) not null check (amount >= 0),
  currency text not null default 'NGN' check (currency in ('NGN','GBP','USD')),
  note text not null default '',
  project_id uuid references public.projects(id) on delete set null,
  subscription_id uuid,
  created_at timestamptz not null default now()
);

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references public.studios(id) on delete cascade,
  name text not null,
  amount numeric(14,2) not null default 0 check (amount >= 0),
  currency text not null default 'USD' check (currency in ('NGN','GBP','USD')),
  cycle text not null default 'monthly' check (cycle in ('monthly','yearly')),
  next_renewal date not null default current_date,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.expenses add constraint expenses_subscription_fk
  foreign key (subscription_id) references public.subscriptions(id) on delete set null;

create index on public.expenses (studio_id);
create index on public.expenses (project_id);
create index on public.expenses (subscription_id);
create index on public.subscriptions (studio_id);

alter table public.expenses enable row level security;
alter table public.subscriptions enable row level security;
create policy "studio rows" on public.expenses for all to authenticated
  using (studio_id = (select public.my_studio_id())) with check (studio_id = (select public.my_studio_id()));
create policy "studio rows" on public.subscriptions for all to authenticated
  using (studio_id = (select public.my_studio_id())) with check (studio_id = (select public.my_studio_id()));

-- ---------- Google Calendar sync ----------
-- Bookings learn about their twin event in Google
alter table public.bookings
  add column ends_at timestamptz,
  add column google_event_id text,
  add column google_synced_at timestamptz,
  add column updated_at timestamptz not null default now();

create or replace function public.touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end $$;
create trigger bookings_touch before update on public.bookings
  for each row execute function public.touch_updated_at();
revoke all on function public.touch_updated_at() from public, anon, authenticated;

-- What the app may see about the connection (no tokens here)
create table public.calendar_connections (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null unique references public.studios(id) on delete cascade,
  google_email text not null default '',
  calendar_id text not null default 'primary',
  last_synced_at timestamptz,
  last_error text,
  created_at timestamptz not null default now()
);
alter table public.calendar_connections enable row level security;
create policy "owner reads connection" on public.calendar_connections for select to authenticated
  using (studio_id = (select public.my_studio_id()));
create policy "owner removes connection" on public.calendar_connections for delete to authenticated
  using (studio_id = (select public.my_studio_id()));

-- Events that were made in Google, shown in Jovita as busy time
create table public.calendar_busy (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references public.studios(id) on delete cascade,
  google_event_id text not null,
  title text not null default 'Busy',
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  all_day boolean not null default false,
  created_at timestamptz not null default now(),
  unique (studio_id, google_event_id)
);
create index on public.calendar_busy (studio_id, starts_at);
alter table public.calendar_busy enable row level security;
create policy "owner reads busy" on public.calendar_busy for select to authenticated
  using (studio_id = (select public.my_studio_id()));

-- Secrets live in a schema the API never exposes; only the edge function (service role) reads them
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
create table private.google_tokens (
  studio_id uuid primary key references public.studios(id) on delete cascade,
  refresh_token text not null,
  sync_token text,
  channel_id text,
  resource_id text,
  channel_expires_at timestamptz,
  updated_at timestamptz not null default now()
);
grant usage on schema private to service_role;
grant all on private.google_tokens to service_role;
