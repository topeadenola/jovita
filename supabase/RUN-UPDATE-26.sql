-- Jovita update 26: gallery and client-page links in the studio's own name.
--   horploadworks.getjovita.com/segun-40th      (every studio)
--   gallery.horploadworks.com/segun-40th          (Studio plan, with their own domain)
-- Paste each part into Supabase › SQL Editor › New query (project: jovita) and press Run. Safe to run more than once.

-- Part 1: the studio's link name, and their own domain
alter table public.studios add column if not exists custom_domain text;
alter table public.studios add column if not exists custom_domain_status text not null default 'none';
alter table public.studios add column if not exists custom_domain_id text;
-- Start every studio's link name from their inbox name (e.g. horpload); they can change it in Settings
update public.studios set slug = inbox_name where (slug is null or slug = '') and inbox_name is not null;
create unique index if not exists studios_slug_key on public.studios (lower(slug)) where slug is not null;
create unique index if not exists studios_custom_domain_key on public.studios (lower(custom_domain)) where custom_domain is not null;
alter table public.studios drop constraint if exists studios_slug_check;
alter table public.studios add constraint studios_slug_check check (slug is null or (
  slug ~ '^[a-z0-9]([a-z0-9-]{0,38}[a-z0-9])?$' and length(slug) >= 3
  and slug not in ('app', 'www', 'media', 'api', 'mail', 'email', 'inbox', 'admin', 'hq', 'help', 'support', 'studios', 'studio', 'jovita', 'getjovita', 'blog', 'docs', 'status', 'cdn', 'assets', 'static', 'dl', 'g', 'p')));

-- Part 2: two galleries in one studio can't share a link name
update public.galleries g set slug = g.slug || '-' || left(g.id::text, 4)
 where g.slug is not null and exists (select 1 from public.galleries o where o.studio_id = g.studio_id and o.slug = g.slug and o.id < g.id);
create unique index if not exists galleries_studio_slug_key on public.galleries (studio_id, slug) where slug is not null;

-- Part 3: only Jovita sets up custom domains (it checks the domain with Cloudflare first)
create or replace function public.guard_studio_admin_fields()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is not null and not public.is_admin() and coalesce(current_setting('jovita.plan_change', true), '') <> 'on' then
    new.plan := old.plan; new.plan_status := old.plan_status; new.plan_started_at := old.plan_started_at; new.plan_until := old.plan_until;
    new.billing_provider := old.billing_provider; new.suspended := old.suspended; new.admin_note := old.admin_note;
    new.lemon_subscription_id := old.lemon_subscription_id; new.lemon_customer_id := old.lemon_customer_id; new.plan_autorenew := old.plan_autorenew;
    new.plan_next := old.plan_next; new.plan_next_at := old.plan_next_at;
    new.custom_domain := old.custom_domain; new.custom_domain_status := old.custom_domain_status; new.custom_domain_id := old.custom_domain_id;
    if new.plan = 'free' and new.logo_path is not null and new.logo_path is distinct from old.logo_path then new.logo_path := old.logo_path; end if;
  end if;
  return new;
end $$;

-- Part 4: what a studio address shows (name and logo only), and which gallery a link name opens
create or replace function public.site_studio(p_host text)
returns public.studios
language sql stable security definer set search_path = '' as $$
  select s.* from public.studios s
   where (lower(p_host) like '%.getjovita.com' and lower(s.slug) = split_part(lower(p_host), '.', 1))
      or (lower(s.custom_domain) = lower(p_host) and s.custom_domain_status = 'active')
   limit 1
$$;
revoke all on function public.site_studio(text) from public, anon, authenticated;

create or replace function public.site_info(p_host text)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare s public.studios;
begin
  s := public.site_studio(p_host);
  if s.id is null then return null; end if;
  return jsonb_build_object('name', s.name, 'logo_path', case when s.plan <> 'free' then s.logo_path end, 'branded', s.plan <> 'free');
end $$;
revoke all on function public.site_info(text) from public;
grant execute on function public.site_info(text) to anon, authenticated;

create or replace function public.site_gallery(p_host text, p_slug text)
returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare s public.studios; t uuid;
begin
  s := public.site_studio(p_host);
  if s.id is null then return null; end if;
  select g.share_token into t from public.galleries g where g.studio_id = s.id and g.slug = lower(p_slug) and g.status = 'delivered' limit 1;
  return t;
end $$;
revoke all on function public.site_gallery(text, text) from public;
grant execute on function public.site_gallery(text, text) to anon, authenticated;

-- Is a link name free? (Settings checks as you type)
create or replace function public.slug_free(p_slug text)
returns boolean
language sql stable security definer set search_path = '' as $$
  select not exists (select 1 from public.studios where lower(slug) = lower(p_slug) and id <> (select public.my_studio_id()))
$$;
revoke all on function public.slug_free(text) from public;
grant execute on function public.slug_free(text) to authenticated;
