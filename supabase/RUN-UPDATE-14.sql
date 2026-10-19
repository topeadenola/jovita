-- Jovita update 14: inbox addresses use the studio name, e.g. inbox+horploadworks@getjovita.com
-- Paste each part into Supabase › SQL Editor › New query and press Run. Safe to run more than once.
-- The old random address (inbox+a3844985b4@…) keeps working.

-- ===== PART 1: columns and helpers =====
alter table public.studios add column if not exists inbox_name text;
alter table public.studios add column if not exists inbox_name_changed boolean not null default false;
create unique index if not exists studios_inbox_name_idx on public.studios (inbox_name);

-- "HORPLOAD WORKS" -> "horploadworks" (letters and numbers only, max 24)
create or replace function public.inbox_slug(p text) returns text
language sql immutable set search_path = '' as $$
  select left(regexp_replace(lower(coalesce(p, '')), '[^a-z0-9]', '', 'g'), 24)
$$;

-- Names no studio can have
create or replace function public.inbox_reserved(p text) returns boolean
language sql immutable set search_path = '' as $$
  select p = any (array['hello','noreply','inbox','support','admin','billing','help','info','team','jovita',
    'mail','postmaster','abuse','security','sales','contact','hq','root','test','studio','privacy','legal','mystudio'])
$$;

-- Free name based on p_base: horploadworks, then horploadworks2, horploadworks3 …
create or replace function public.pick_inbox_name(p_base text, p_studio uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare b text := public.inbox_slug(p_base); n int := 1; cand text;
begin
  if length(b) < 3 then b := 'studio'; end if;
  cand := b;
  while public.inbox_reserved(cand)
     or exists (select 1 from public.studios where (inbox_name = cand or inbox_code = cand) and id <> p_studio) loop
    n := n + 1; cand := left(b, 22) || n;
  end loop;
  return cand;
end $$;
revoke all on function public.pick_inbox_name(text, uuid) from public, anon, authenticated;

-- ===== PART 2: give each studio its name, and protect it =====
-- Set automatically the first time the studio has a name. After that only set_inbox_name() can change it (once).
create or replace function public.studio_inbox_name() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE'
     and (new.inbox_name is distinct from old.inbox_name or new.inbox_name_changed is distinct from old.inbox_name_changed)
     and coalesce(current_setting('jovita.inbox_change', true), '') <> 'on'
     and (select auth.uid()) is not null and not public.is_admin() then
    new.inbox_name := old.inbox_name; new.inbox_name_changed := old.inbox_name_changed;
  end if;
  -- wait for a real name: new sign-ups start as "My studio"
  if new.inbox_name is null and length(public.inbox_slug(new.name)) >= 3 and public.inbox_slug(new.name) <> 'mystudio' then
    new.inbox_name := public.pick_inbox_name(new.name, new.id);
  end if;
  return new;
end $$;
drop trigger if exists studios_inbox_name on public.studios;
create trigger studios_inbox_name before insert or update on public.studios
  for each row execute function public.studio_inbox_name();

-- Fill in the studios that already exist, one at a time
do $$ declare r record; begin
  for r in select id, name from public.studios where inbox_name is null and length(public.inbox_slug(name)) >= 3 and public.inbox_slug(name) <> 'mystudio' order by created_at loop
    update public.studios set inbox_name = public.pick_inbox_name(r.name, r.id) where id = r.id;
  end loop;
end $$;

-- ===== PART 3: let a studio pick its own name (once) =====
-- p_check_only = true just says if it's free, without saving
create or replace function public.set_inbox_name(p_name text, p_check_only boolean default false) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare s record; v text := public.inbox_slug(p_name);
begin
  select id, inbox_name, inbox_name_changed into s from public.studios where id = public.my_studio_id();
  if s.id is null then return jsonb_build_object('ok', false, 'error', 'no_studio'); end if;
  if length(v) < 3 then return jsonb_build_object('ok', false, 'error', 'too_short', 'name', v); end if;
  if public.inbox_reserved(v) then return jsonb_build_object('ok', false, 'error', 'reserved', 'name', v); end if;
  if v = s.inbox_name then return jsonb_build_object('ok', true, 'name', v, 'same', true); end if;
  if exists (select 1 from public.studios where (inbox_name = v or inbox_code = v) and id <> s.id) then
    return jsonb_build_object('ok', false, 'error', 'taken', 'name', v, 'suggest', public.pick_inbox_name(v, s.id));
  end if;
  if p_check_only then return jsonb_build_object('ok', true, 'name', v); end if;
  if s.inbox_name_changed then return jsonb_build_object('ok', false, 'error', 'already_changed', 'name', v); end if;
  perform set_config('jovita.inbox_change', 'on', true);
  update public.studios set inbox_name = v, inbox_name_changed = true where id = s.id;
  return jsonb_build_object('ok', true, 'name', v, 'saved', true);
end $$;
revoke all on function public.set_inbox_name(text, boolean) from public, anon;
grant execute on function public.set_inbox_name(text, boolean) to authenticated;
