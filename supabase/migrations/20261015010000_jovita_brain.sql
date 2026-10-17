-- Jovita brain: private memory per studio, a usage log for limits and HQ stats.
-- Every row belongs to one studio. Row-level security means a studio can only ever read its own.

-- Things Jovita remembers about a studio ("Tara prefers WhatsApp", "I always add a 10% deposit")
create table if not exists public.jovita_memory (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null default public.my_studio_id() references public.studios(id) on delete cascade,
  fact text not null check (char_length(fact) between 1 and 300),
  created_at timestamptz not null default now()
);
create index if not exists jovita_memory_studio_idx on public.jovita_memory (studio_id);
alter table public.jovita_memory enable row level security;
drop policy if exists "studio rows" on public.jovita_memory;
create policy "studio rows" on public.jovita_memory for all to authenticated
  using (studio_id = (select public.my_studio_id())) with check (studio_id = (select public.my_studio_id()));

-- One row per question. Studios can add and read their own rows, never change or delete them.
create table if not exists public.ai_usage (
  id bigint generated always as identity primary key,
  studio_id uuid not null default public.my_studio_id() references public.studios(id) on delete cascade,
  model text not null default '',
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  tools integer not null default 0,
  actions integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists ai_usage_studio_idx on public.ai_usage (studio_id, created_at);
alter table public.ai_usage enable row level security;
drop policy if exists "studio reads usage" on public.ai_usage;
create policy "studio reads usage" on public.ai_usage for select to authenticated using (studio_id = (select public.my_studio_id()));
drop policy if exists "studio adds usage" on public.ai_usage;
create policy "studio adds usage" on public.ai_usage for insert to authenticated with check (studio_id = (select public.my_studio_id()));

-- How many questions a studio has left this month (limits are placeholders, change them here)
create or replace function public.jovita_quota()
returns jsonb language sql stable security definer set search_path = '' as $$
  with s as (select id, coalesce(plan, 'free') as plan, suspended from public.studios where id = public.my_studio_id()),
       u as (select count(*)::int as used, count(*) filter (where created_at > now() - interval '1 minute')::int as last_min
             from public.ai_usage where studio_id = (select id from s) and created_at >= date_trunc('month', now()))
  select jsonb_build_object(
    'plan', s.plan, 'suspended', s.suspended, 'used', u.used, 'last_minute', u.last_min,
    'limit', case s.plan when 'studio' then 3000 when 'pro' then 300 else 40 end)
  from s, u
$$;
revoke all on function public.jovita_quota() from public, anon;
grant execute on function public.jovita_quota() to authenticated;

-- HQ: how much the brain is used (counts only, never what anyone asked)
create or replace function public.admin_ai_usage(p_days int default 30)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare since timestamptz := case when p_days > 0 then now() - make_interval(days => p_days) else '-infinity'::timestamptz end;
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  return (
    with u as (select a.*, coalesce(s.plan, 'free') as plan from public.ai_usage a join public.studios s on s.id = a.studio_id where a.created_at >= since)
    select jsonb_build_object(
      'questions', (select count(*) from u),
      'studios', (select count(distinct studio_id) from u),
      'input_tokens', (select coalesce(sum(input_tokens), 0) from u),
      'output_tokens', (select coalesce(sum(output_tokens), 0) from u),
      'actions', (select coalesce(sum(actions), 0) from u),
      'by_model', (select coalesce(jsonb_object_agg(model, jsonb_build_object('n', n, 'in', i, 'out', o)), '{}'::jsonb)
                   from (select model, count(*) n, sum(input_tokens) i, sum(output_tokens) o from u group by model) m),
      'by_plan', (select coalesce(jsonb_object_agg(plan, n), '{}'::jsonb) from (select plan, count(*) n from u group by plan) p),
      'daily', (select coalesce(jsonb_agg(jsonb_build_object('day', d, 'questions', n) order by d), '[]'::jsonb)
                from (select created_at::date d, count(*) n from u group by 1) x),
      'top', (select coalesce(jsonb_agg(jsonb_build_object('studio_id', id, 'name', name, 'plan', plan, 'questions', n) order by n desc), '[]'::jsonb)
              from (select s.id, s.name, coalesce(s.plan, 'free') plan, count(*) n from u join public.studios s on s.id = u.studio_id group by s.id order by n desc limit 8) t)
    )
  );
end $$;
revoke all on function public.admin_ai_usage(int) from public, anon;
grant execute on function public.admin_ai_usage(int) to authenticated;
