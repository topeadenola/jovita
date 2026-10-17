-- Jovita Super Admin: plans, an events log, admin notifications, milestones, announcements, audit trail,
-- and read-only admin reports. Only people in public.admins can use any of it.

-- ---------- Who is an admin ----------
create table if not exists public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  role text not null default 'owner' check (role in ('owner','viewer')),
  created_at timestamptz not null default now()
);
alter table public.admins enable row level security;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.admins where user_id = (select auth.uid()))
$$;
revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

drop policy if exists "admins read admins" on public.admins;
create policy "admins read admins" on public.admins for select to authenticated using ((select public.is_admin()));

-- The founder's account is the first admin (change the email here if you sign in with another one)
insert into public.admins (user_id, email)
select id, email from auth.users where lower(email) = 'tope.adenola@gmail.com'
on conflict (user_id) do nothing;

-- ---------- Plans on every studio ----------
alter table public.studios add column if not exists plan text not null default 'free';
alter table public.studios drop constraint if exists studios_plan_check;
alter table public.studios add constraint studios_plan_check check (plan in ('free','pro','studio'));
alter table public.studios add column if not exists plan_status text not null default 'active';
alter table public.studios drop constraint if exists studios_plan_status_check;
alter table public.studios add constraint studios_plan_status_check check (plan_status in ('active','trialing','past_due','cancelled'));
alter table public.studios add column if not exists plan_started_at timestamptz;
alter table public.studios add column if not exists billing_provider text;
alter table public.studios add column if not exists country text;
alter table public.studios add column if not exists suspended boolean not null default false;
alter table public.studios add column if not exists admin_note text not null default '';

-- Studios cannot give themselves a paid plan or lift a suspension: those columns change only through admin functions
create or replace function public.guard_studio_admin_fields()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is not null and not public.is_admin() then
    new.plan := old.plan; new.plan_status := old.plan_status; new.plan_started_at := old.plan_started_at;
    new.billing_provider := old.billing_provider; new.suspended := old.suspended; new.admin_note := old.admin_note;
  end if;
  return new;
end $$;
drop trigger if exists guard_studio_admin_fields on public.studios;
create trigger guard_studio_admin_fields before update on public.studios for each row execute function public.guard_studio_admin_fields();

-- Placeholder prices per plan and currency (edit them in the admin; used for estimated monthly revenue)
create table if not exists public.plan_prices (
  plan text not null check (plan in ('free','pro','studio')),
  currency text not null,
  monthly_amount numeric(14,2) not null default 0,
  primary key (plan, currency)
);
alter table public.plan_prices enable row level security;
drop policy if exists "anyone reads prices" on public.plan_prices;
create policy "anyone reads prices" on public.plan_prices for select to anon, authenticated using (true);
drop policy if exists "admins change prices" on public.plan_prices;
create policy "admins change prices" on public.plan_prices for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
insert into public.plan_prices (plan, currency, monthly_amount) values
  ('free','NGN',0),('pro','NGN',19500),('studio','NGN',39000),
  ('free','GBP',0),('pro','GBP',15),('studio','GBP',32),
  ('free','USD',0),('pro','USD',19),('studio','USD',39),
  ('free','EUR',0),('pro','EUR',18),('studio','EUR',36),
  ('free','XOF',0),('pro','XOF',11500),('studio','XOF',23000)
on conflict do nothing;

-- Jovita's own subscription payments (filled in once Paystack/Stripe billing is connected)
create table if not exists public.billing_payments (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid references public.studios(id) on delete set null,
  plan text not null,
  amount numeric(14,2) not null,
  currency text not null,
  provider text not null check (provider in ('paystack','stripe','manual')),
  status text not null default 'paid' check (status in ('paid','failed','refunded')),
  reference text,
  paid_at timestamptz not null default now()
);
create index if not exists billing_payments_paid_idx on public.billing_payments (paid_at);
alter table public.billing_payments enable row level security;
drop policy if exists "admins read billing" on public.billing_payments;
create policy "admins read billing" on public.billing_payments for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

-- ---------- Events log (the history behind every chart) ----------
create table if not exists public.events (
  id bigint generated always as identity primary key,
  studio_id uuid references public.studios(id) on delete cascade,
  kind text not null,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists events_created_idx on public.events (created_at desc);
create index if not exists events_kind_idx on public.events (kind, created_at desc);
create index if not exists events_studio_idx on public.events (studio_id);
alter table public.events enable row level security;
drop policy if exists "admins read events" on public.events;
create policy "admins read events" on public.events for select to authenticated using ((select public.is_admin()));

-- ---------- Admin notifications and milestones ----------
create table if not exists public.admin_notifications (
  id bigint generated always as identity primary key,
  kind text not null,
  title text not null,
  body text not null default '',
  studio_id uuid references public.studios(id) on delete set null,
  read boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists admin_notifications_created_idx on public.admin_notifications (created_at desc);
alter table public.admin_notifications enable row level security;
drop policy if exists "admins notifications" on public.admin_notifications;
create policy "admins notifications" on public.admin_notifications for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

create table if not exists public.milestones (
  metric text not null default 'studios',
  goal integer not null,
  reached_at timestamptz,
  celebrated boolean not null default false,
  primary key (metric, goal)
);
alter table public.milestones enable row level security;
drop policy if exists "admins milestones" on public.milestones;
create policy "admins milestones" on public.milestones for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
insert into public.milestones (metric, goal)
select m, g from (values ('studios'),('paying')) v(m), unnest(array[10,50,100,250,500,1000,2500,5000,10000,25000,50000,100000]) g
on conflict do nothing;

-- Record an event, and tell the admin about the important ones
create or replace function public.log_event(p_studio uuid, p_kind text, p_meta jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare s record; n int; ms record;
begin
  insert into public.events (studio_id, kind, meta) values (p_studio, p_kind, coalesce(p_meta, '{}'::jsonb));
  select name, plan into s from public.studios where id = p_studio;
  if p_kind = 'signup' then
    insert into public.admin_notifications (kind, title, body, studio_id) values ('signup', 'New studio signed up', coalesce(s.name, 'A new studio') || coalesce(' · ' || (p_meta->>'email'), ''), p_studio);
  elsif p_kind in ('upgrade','downgrade','cancel') then
    insert into public.admin_notifications (kind, title, body, studio_id)
    values (p_kind, case p_kind when 'upgrade' then 'Upgrade' when 'downgrade' then 'Downgrade' else 'Cancelled' end,
            coalesce(s.name, 'A studio') || ': ' || coalesce(p_meta->>'from', '?') || ' → ' || coalesce(p_meta->>'to', '?'), p_studio);
  elsif p_kind = 'payment_failed' then
    insert into public.admin_notifications (kind, title, body, studio_id) values ('payment_failed', 'Subscription payment failed', coalesce(s.name, 'A studio'), p_studio);
  end if;
  -- Milestones
  for ms in select m.metric, m.goal from public.milestones m where m.reached_at is null loop
    if ms.metric = 'studios' then select count(*) into n from public.studios;
    else select count(*) into n from public.studios where plan <> 'free' and plan_status in ('active','trialing'); end if;
    if n >= ms.goal then
      update public.milestones set reached_at = now() where metric = ms.metric and goal = ms.goal;
      insert into public.admin_notifications (kind, title, body)
      values ('milestone', to_char(ms.goal, 'FM999,999') || case ms.metric when 'studios' then ' studios!' else ' paying subscribers!' end, 'A new Jovita milestone. Time to celebrate.');
    end if;
  end loop;
end $$;
revoke all on function public.log_event(uuid, text, jsonb) from public, anon, authenticated;

-- Triggers that write the events
create or replace function public.ev_studio()
returns trigger language plpgsql security definer set search_path = '' as $$
declare rank_old int; rank_new int;
begin
  if tg_op = 'INSERT' then
    perform public.log_event(new.id, 'signup', jsonb_build_object('email', (select email from auth.users where id = new.owner_id)));
  else
    if new.onboarded is distinct from old.onboarded and new.onboarded then perform public.log_event(new.id, 'onboarded', jsonb_build_object('careers', new.careers)); end if;
    if new.plan is distinct from old.plan then
      rank_old := array_position(array['free','pro','studio'], old.plan); rank_new := array_position(array['free','pro','studio'], new.plan);
      perform public.log_event(new.id, case when new.plan = 'free' then 'cancel' when rank_new > rank_old then 'upgrade' else 'downgrade' end, jsonb_build_object('from', old.plan, 'to', new.plan));
    end if;
  end if;
  return new;
end $$;
drop trigger if exists ev_studio_ins on public.studios;
create trigger ev_studio_ins after insert on public.studios for each row execute function public.ev_studio();
drop trigger if exists ev_studio_upd on public.studios;
create trigger ev_studio_upd after update on public.studios for each row execute function public.ev_studio();

create or replace function public.ev_activity()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_table_name = 'clients' and tg_op = 'INSERT' then perform public.log_event(new.studio_id, 'client_added', '{}'::jsonb);
  elsif tg_table_name = 'projects' and tg_op = 'INSERT' then perform public.log_event(new.studio_id, 'project_created', jsonb_build_object('type', new.type));
  elsif tg_table_name = 'invoices' then
    if new.status = 'sent' and (tg_op = 'INSERT' or old.status is distinct from 'sent') then perform public.log_event(new.studio_id, 'invoice_sent', jsonb_build_object('amount', new.amount, 'currency', new.currency)); end if;
    if new.status = 'paid' and (tg_op = 'INSERT' or old.status is distinct from 'paid') then perform public.log_event(new.studio_id, 'invoice_paid', jsonb_build_object('amount', new.amount, 'currency', new.currency)); end if;
  elsif tg_table_name = 'galleries' then
    if new.status = 'delivered' and (tg_op = 'INSERT' or old.status is distinct from 'delivered') then perform public.log_event(new.studio_id, 'gallery_published', '{}'::jsonb); end if;
  end if;
  return new;
end $$;
drop trigger if exists ev_clients on public.clients;
create trigger ev_clients after insert on public.clients for each row execute function public.ev_activity();
drop trigger if exists ev_projects on public.projects;
create trigger ev_projects after insert on public.projects for each row execute function public.ev_activity();
drop trigger if exists ev_invoices on public.invoices;
create trigger ev_invoices after insert or update of status on public.invoices for each row execute function public.ev_activity();
drop trigger if exists ev_galleries on public.galleries;
create trigger ev_galleries after insert or update of status on public.galleries for each row execute function public.ev_activity();

-- Backfill: give existing studios a signup event at their real join date (runs once)
insert into public.events (studio_id, kind, meta, created_at)
select s.id, 'signup', jsonb_build_object('email', u.email, 'backfill', true), s.created_at
from public.studios s join auth.users u on u.id = s.owner_id
where not exists (select 1 from public.events e where e.studio_id = s.id and e.kind = 'signup');
-- Mark milestones already passed as reached and celebrated (so no surprise pop-ups for old numbers)
update public.milestones set reached_at = now(), celebrated = true
where reached_at is null and ((metric = 'studios' and goal <= (select count(*) from public.studios))
   or (metric = 'paying' and goal <= (select count(*) from public.studios where plan <> 'free')));

-- ---------- Announcements shown inside every studio's app ----------
create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null default '',
  level text not null default 'info' check (level in ('info','success','warning')),
  link text,
  audience text not null default 'all' check (audience in ('all','free','pro','studio')),
  active boolean not null default true,
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.announcements enable row level security;
drop policy if exists "studios read live announcements" on public.announcements;
create policy "studios read live announcements" on public.announcements for select to authenticated
  using ((active and starts_at <= now() and (ends_at is null or ends_at > now())) or (select public.is_admin()));
drop policy if exists "admins manage announcements" on public.announcements;
create policy "admins manage announcements" on public.announcements for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

-- ---------- Audit trail of admin actions ----------
create table if not exists public.admin_audit (
  id bigint generated always as identity primary key,
  admin_id uuid not null,
  action text not null,
  studio_id uuid,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
alter table public.admin_audit enable row level security;
drop policy if exists "admins read audit" on public.admin_audit;
create policy "admins read audit" on public.admin_audit for select to authenticated using ((select public.is_admin()));

-- ---------- Admin reports (read-only, account level; no client photos or messages) ----------
create or replace function public.admin_overview(p_days int default 30)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare since timestamptz := case when p_days > 0 then now() - make_interval(days => p_days) else '-infinity'::timestamptz end;
        prev timestamptz := case when p_days > 0 then now() - make_interval(days => p_days * 2) else '-infinity'::timestamptz end;
        out jsonb;
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  select jsonb_build_object(
    'now', now(),
    'studios', (select count(*) from public.studios),
    'studios_prev', (select count(*) from public.studios where created_at < since),
    'signups', (select count(*) from public.studios where created_at >= since),
    'signups_prev', (select count(*) from public.studios where created_at >= prev and created_at < since),
    'active', (select count(*) from auth.users u join public.studios s on s.owner_id = u.id where u.last_sign_in_at >= now() - interval '30 days'),
    'active7', (select count(*) from auth.users u join public.studios s on s.owner_id = u.id where u.last_sign_in_at >= now() - interval '7 days'),
    'onboarded', (select count(*) from public.studios where onboarded),
    'suspended', (select count(*) from public.studios where suspended),
    'plans', (select jsonb_object_agg(p, c) from (select p, (select count(*) from public.studios where plan = p) c from unnest(array['free','pro','studio']) p) x),
    'paying', (select count(*) from public.studios where plan <> 'free' and plan_status in ('active','trialing')),
    'paying_prev', (select count(*) from public.studios where plan <> 'free' and created_at < since),
    'mrr', (select coalesce(jsonb_object_agg(cur, amt), '{}'::jsonb) from (
              select s.home_currency cur, sum(coalesce(pp.monthly_amount, 0)) amt from public.studios s
              left join public.plan_prices pp on pp.plan = s.plan and pp.currency = s.home_currency
              where s.plan <> 'free' and s.plan_status in ('active','trialing') group by s.home_currency) m),
    'billing', (select coalesce(jsonb_object_agg(currency, amt), '{}'::jsonb) from (select currency, sum(amount) amt from public.billing_payments where status = 'paid' and paid_at >= since group by currency) b),
    'billing_count', (select count(*) from public.billing_payments where status = 'paid' and paid_at >= since),
    'processed', (select coalesce(jsonb_object_agg(currency, amt), '{}'::jsonb) from (select currency, sum(amount) amt from public.invoices where status = 'paid' and coalesce(paid_at, created_at) >= since group by currency) i),
    'processed_prev', (select coalesce(jsonb_object_agg(currency, amt), '{}'::jsonb) from (select currency, sum(amount) amt from public.invoices where status = 'paid' and coalesce(paid_at, created_at) >= prev and coalesce(paid_at, created_at) < since group by currency) i),
    'invoices_sent', (select count(*) from public.events where kind = 'invoice_sent' and created_at >= since),
    'galleries', (select count(*) from public.galleries),
    'clients', (select count(*) from public.clients),
    'projects', (select count(*) from public.projects),
    'daily', (select coalesce(jsonb_agg(jsonb_build_object('d', d::date, 'signups', (select count(*) from public.studios s where s.created_at::date = d::date),
                 'upgrades', (select count(*) from public.events e where e.kind = 'upgrade' and e.created_at::date = d::date),
                 'active', (select count(distinct e.studio_id) from public.events e where e.created_at::date = d::date)) order by d), '[]'::jsonb)
              from generate_series(greatest(coalesce((select min(created_at) from public.studios), now()), case when p_days > 0 then now() - make_interval(days => p_days - 1) else '-infinity'::timestamptz end)::date, now()::date, interval '1 day') d),
    'countries', (select coalesce(jsonb_agg(jsonb_build_object('k', k, 'n', n) order by n desc), '[]'::jsonb) from (select coalesce(nullif(country, ''), home_currency) k, count(*) n from public.studios group by 1 order by 2 desc limit 8) c),
    'careers', (select coalesce(jsonb_agg(jsonb_build_object('k', k, 'n', n) order by n desc), '[]'::jsonb) from (select unnest(careers) k, count(*) n from public.studios group by 1 order by 2 desc limit 8) c),
    'languages', (select coalesce(jsonb_agg(jsonb_build_object('k', k, 'n', n) order by n desc), '[]'::jsonb) from (select coalesce(nullif(language, ''), 'auto') k, count(*) n from public.studios group by 1) l),
    'funnel', jsonb_build_array(
      (select count(*) from public.studios where created_at >= since),
      (select count(*) from public.studios where created_at >= since and onboarded),
      (select count(distinct s.id) from public.studios s join public.clients c on c.studio_id = s.id where s.created_at >= since),
      (select count(distinct s.id) from public.studios s join public.invoices i on i.studio_id = s.id and i.status in ('sent','paid') where s.created_at >= since),
      (select count(distinct s.id) from public.studios s join public.invoices i on i.studio_id = s.id and i.status = 'paid' where s.created_at >= since),
      (select count(*) from public.studios where created_at >= since and plan <> 'free')),
    'next_milestone', (select jsonb_build_object('goal', goal, 'metric', metric) from public.milestones where metric = 'studios' and reached_at is null order by goal limit 1),
    'recent', (select coalesce(jsonb_agg(r order by r->>'at' desc), '[]'::jsonb) from (
       select jsonb_build_object('kind', e.kind, 'at', e.created_at, 'studio', s.name, 'studio_id', e.studio_id, 'meta', e.meta) r
       from public.events e left join public.studios s on s.id = e.studio_id order by e.created_at desc limit 12) x)
  ) into out;
  return out;
end $$;
revoke all on function public.admin_overview(int) from public, anon;
grant execute on function public.admin_overview(int) to authenticated;

create or replace function public.admin_studios(p_search text default '', p_plan text default '', p_limit int default 50, p_offset int default 0)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  return (select jsonb_build_object(
    'total', (select count(*) from public.studios s join auth.users u on u.id = s.owner_id
              where (p_plan = '' or s.plan = p_plan) and (p_search = '' or s.name ilike '%' || p_search || '%' or u.email ilike '%' || p_search || '%' or s.owner_first_name ilike '%' || p_search || '%')),
    'rows', coalesce(jsonb_agg(row_to_json(t) order by t.created_at desc), '[]'::jsonb))
    from (
      select s.id, s.name, s.owner_first_name, u.email, s.plan, s.plan_status, s.suspended, s.home_currency, s.language, s.country, s.careers, s.onboarded, s.created_at,
             u.last_sign_in_at, s.admin_note, s.logo_path,
             (select count(*) from public.clients c where c.studio_id = s.id) clients,
             (select count(*) from public.projects p where p.studio_id = s.id) projects,
             (select count(*) from public.invoices i where i.studio_id = s.id) invoices,
             (select count(*) from public.galleries g where g.studio_id = s.id) galleries,
             (select coalesce(jsonb_object_agg(currency, amt), '{}'::jsonb) from (select currency, sum(amount) amt from public.invoices i where i.studio_id = s.id and i.status = 'paid' group by currency) x) processed
      from public.studios s join auth.users u on u.id = s.owner_id
      where (p_plan = '' or s.plan = p_plan) and (p_search = '' or s.name ilike '%' || p_search || '%' or u.email ilike '%' || p_search || '%' or s.owner_first_name ilike '%' || p_search || '%')
      order by s.created_at desc limit p_limit offset p_offset
    ) t);
end $$;
revoke all on function public.admin_studios(text, text, int, int) from public, anon;
grant execute on function public.admin_studios(text, text, int, int) to authenticated;

create or replace function public.admin_studio_events(p_studio uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('kind', kind, 'at', created_at, 'meta', meta) order by created_at desc) from (select * from public.events where studio_id = p_studio order by created_at desc limit 40) e), '[]'::jsonb);
end $$;
revoke all on function public.admin_studio_events(uuid) from public, anon;
grant execute on function public.admin_studio_events(uuid) to authenticated;

-- Admin actions (each one is written to the audit trail)
create or replace function public.admin_update_studio(p_studio uuid, p_patch jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  update public.studios set
    plan = coalesce(p_patch->>'plan', plan),
    plan_status = coalesce(p_patch->>'plan_status', plan_status),
    plan_started_at = case when p_patch ? 'plan' and p_patch->>'plan' <> plan then now() else plan_started_at end,
    suspended = coalesce((p_patch->>'suspended')::boolean, suspended),
    admin_note = coalesce(p_patch->>'admin_note', admin_note),
    country = coalesce(p_patch->>'country', country)
  where id = p_studio;
  insert into public.admin_audit (admin_id, action, studio_id, meta) values ((select auth.uid()), 'update_studio', p_studio, p_patch);
end $$;
revoke all on function public.admin_update_studio(uuid, jsonb) from public, anon;
grant execute on function public.admin_update_studio(uuid, jsonb) to authenticated;

-- Live notifications in the admin
do $$ begin
  begin alter publication supabase_realtime add table public.admin_notifications; exception when others then null; end;
end $$;
