-- Jovita update 15: clients can share their selection.
-- The client picks favourites, taps "Share my selection" and sends the link to someone (partner, mum, planner).
-- That person sees ONLY the picked photos, enters their name + email, and hearts their own picks.
-- In the studio, Activity › Favourites shows who picked what, by email, and whose selection they came from.
-- Paste each part into Supabase › SQL Editor › New query and press Run. Safe to run more than once.

-- ===== PART 1: share links table, and "via" on favourites =====
create table if not exists public.gallery_shares (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references public.studios(id) on delete cascade,
  gallery_id uuid not null references public.galleries(id) on delete cascade,
  token uuid not null unique default gen_random_uuid(),
  viewer text not null,            -- who shared (their email or browser id)
  viewer_name text not null default '',
  views integer not null default 0,
  last_viewed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (gallery_id, viewer)
);
create index if not exists gallery_shares_studio_idx on public.gallery_shares (studio_id);
alter table public.gallery_shares enable row level security;
drop policy if exists "studio rows" on public.gallery_shares;
create policy "studio rows" on public.gallery_shares for select to authenticated
  using (studio_id = (select public.my_studio_id()));

alter table public.gallery_favorites add column if not exists via text not null default '';

-- ===== PART 2: gallery_check also opens share links (no gallery password: the person who shared already had it) =====
create or replace function public.gallery_check(p_token uuid, p_password text)
returns public.galleries
language plpgsql stable security definer set search_path = '' as $$
declare g public.galleries; inv public.gallery_invites; sh public.gallery_shares; pw text;
begin
  select * into sh from public.gallery_shares where token = p_token;
  if found then
    select * into g from public.galleries where id = sh.gallery_id;
    if g.id is null or g.status <> 'delivered' or (g.expires_on is not null and g.expires_on < current_date) then return null; end if;
    return g;
  end if;
  select * into inv from public.gallery_invites where token = p_token;
  if found then select * into g from public.galleries where id = inv.gallery_id;
  else select * into g from public.galleries where share_token = p_token; end if;
  if g.id is null or g.status <> 'delivered' or (g.expires_on is not null and g.expires_on < current_date) then return null; end if;
  pw := nullif(g.settings->>'password', '');
  if pw is not null and coalesce(p_password, '') <> pw then return null; end if;
  return g;
end $$;

-- Make (or reuse) the share link for this viewer's selection
create or replace function public.gallery_share_selection(p_token uuid, p_password text, p_viewer text, p_name text default '')
returns uuid
language plpgsql security definer set search_path = '' as $$
declare g public.galleries; v text := left(coalesce(p_viewer, ''), 200); t uuid;
begin
  if exists (select 1 from public.gallery_shares where token = p_token) then raise exception 'Only the client can share this selection.'; end if;
  g := public.gallery_check(p_token, p_password);
  if g.id is null or length(v) < 3 then raise exception 'This gallery is not available.'; end if;
  if not exists (select 1 from public.gallery_favorites f where f.gallery_id = g.id and f.viewer = v) then raise exception 'Pick some favourites first.'; end if;
  insert into public.gallery_shares (studio_id, gallery_id, viewer, viewer_name)
  values (g.studio_id, g.id, v, left(coalesce(p_name, ''), 80))
  on conflict (gallery_id, viewer) do update set viewer_name = coalesce(nullif(excluded.viewer_name, ''), public.gallery_shares.viewer_name)
  returning token into t;
  return t;
end $$;
revoke all on function public.gallery_share_selection(uuid, text, text, text) from public;
grant execute on function public.gallery_share_selection(uuid, text, text, text) to anon, authenticated;

-- ===== PART 3: open_gallery shows only the selected photos on a share link =====
create or replace function public.open_gallery(p_token uuid, p_password text default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  g public.galleries;
  inv public.gallery_invites;
  sh public.gallery_shares;
  pw text;
  studio jsonb;
begin
  select * into sh from public.gallery_shares where token = p_token;
  if found then
    select * into g from public.galleries where id = sh.gallery_id;
  else
    select * into inv from public.gallery_invites where token = p_token;
    if found then
      select * into g from public.galleries where id = inv.gallery_id;
    else
      select * into g from public.galleries where share_token = p_token;
    end if;
  end if;
  if g.id is null then return null; end if;
  if g.status <> 'delivered' then return jsonb_build_object('error', 'not_published'); end if;
  if g.expires_on is not null and g.expires_on < current_date then return jsonb_build_object('error', 'expired'); end if;
  studio := (select jsonb_build_object('name', s.name, 'logo_path', case when s.plan <> 'free' then s.logo_path end, 'branded', s.plan <> 'free') from public.studios s where s.id = g.studio_id);

  -- A shared selection: only the photos that person picked, no downloads
  if sh.id is not null then
    update public.gallery_shares set views = views + 1, last_viewed_at = now() where id = sh.id;
    return jsonb_build_object(
      'title', g.title, 'event_date', g.event_date, 'cover_path', g.cover_path, 'sets', g.sets, 'design', g.design,
      'download', jsonb_build_object('on', false), 'favorite', g.settings->'favorite',
      'studio', studio, 'viewer', null,
      'share', jsonb_build_object('by', coalesce(nullif(sh.viewer_name, ''), 'Your friend')),
      'photos', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'path', p.path, 'name', p.name, 'set_id', p.set_id, 'width', p.width, 'height', p.height, 'has_thumb', p.has_thumb) order by p.position)
        from public.gallery_photos p where p.gallery_id = g.id
          and exists (select 1 from public.gallery_favorites f where f.photo_id = p.id and f.viewer = sh.viewer)), '[]'::jsonb)
    );
  end if;

  pw := nullif(g.settings->>'password', '');
  if pw is not null and coalesce(p_password, '') <> pw then
    return jsonb_build_object('error', 'password', 'title', g.title, 'event_date', g.event_date,
      'cover_path', coalesce(g.cover_path, (select p.path from public.gallery_photos p where p.gallery_id = g.id order by p.position limit 1)),
      'studio', studio);
  end if;
  if inv.id is not null then
    update public.gallery_invites
      set views = views + 1, last_viewed_at = now(), first_viewed_at = coalesce(first_viewed_at, now())
      where id = inv.id;
  end if;
  return jsonb_build_object(
    'title', g.title, 'event_date', g.event_date, 'cover_path', g.cover_path, 'sets', g.sets, 'design', g.design,
    'download', (g.settings->'download') - 'pin', 'favorite', g.settings->'favorite',
    'studio', studio,
    'viewer', case when inv.id is not null then jsonb_build_object('email', inv.email, 'name', inv.name) else null end,
    'photos', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'path', p.path, 'name', p.name, 'set_id', p.set_id, 'width', p.width, 'height', p.height, 'has_thumb', p.has_thumb) order by p.position)
      from public.gallery_photos p where p.gallery_id = g.id), '[]'::jsonb)
  );
end $$;

-- ===== PART 4: hearts, notes and downloads on share links =====
-- Hearts: a guest must give an email, can only heart photos in the selection, and we note whose selection it came from
create or replace function public.gallery_toggle_favorite(p_token uuid, p_password text, p_photo uuid, p_viewer text, p_name text default '')
returns boolean
language plpgsql security definer set search_path = '' as $$
declare g public.galleries; sh public.gallery_shares; v text := left(lower(btrim(coalesce(p_viewer, ''))), 200);
begin
  g := public.gallery_check(p_token, p_password);
  if g.id is null or length(v) < 3 then raise exception 'This gallery is not available.'; end if;
  if coalesce((g.settings->'favorite'->>'on')::boolean, true) = false then raise exception 'Favourites are switched off for this gallery.'; end if;
  if not exists (select 1 from public.gallery_photos p where p.id = p_photo and p.gallery_id = g.id) then raise exception 'Photo not found.'; end if;
  select * into sh from public.gallery_shares where token = p_token;
  if sh.id is not null then
    if v !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Enter your email first.'; end if;
    if v = sh.viewer then raise exception 'These are already your picks.'; end if;
    if not exists (select 1 from public.gallery_favorites f where f.photo_id = p_photo and f.viewer = sh.viewer) then raise exception 'Photo not found.'; end if;
  end if;
  delete from public.gallery_favorites where photo_id = p_photo and viewer = v;
  if found then
    update public.galleries set favourites = greatest(0, favourites - 1) where id = g.id;
    return false;
  end if;
  insert into public.gallery_favorites (studio_id, gallery_id, photo_id, viewer, viewer_name, via)
  values (g.studio_id, g.id, p_photo, v, left(coalesce(p_name, ''), 80), case when sh.id is not null then coalesce(nullif(sh.viewer_name, ''), 'a client') else '' end);
  update public.galleries set favourites = favourites + 1 where id = g.id;
  return true;
end $$;

-- Notes stay between the client and the studio: guests on a share link don't see or add them
create or replace function public.gallery_feedback(p_token uuid, p_password text, p_viewer text)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare g public.galleries; shared boolean := exists (select 1 from public.gallery_shares where token = p_token);
begin
  g := public.gallery_check(p_token, p_password);
  if g.id is null then return null; end if;
  return jsonb_build_object(
    'favorites', coalesce((select jsonb_agg(f.photo_id) from public.gallery_favorites f where f.gallery_id = g.id and f.viewer = left(lower(btrim(coalesce(p_viewer, ''))), 200)), '[]'::jsonb),
    'comments', case when shared then '[]'::jsonb else coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'photo_id', c.photo_id, 'from_client', c.from_client, 'author', c.author, 'body', c.body, 'created_at', c.created_at) order by c.created_at)
       from public.gallery_comments c where c.gallery_id = g.id), '[]'::jsonb) end);
end $$;

create or replace function public.gallery_add_comment(p_token uuid, p_password text, p_photo uuid, p_viewer text, p_name text, p_body text)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare g public.galleries; ph public.gallery_photos; c public.gallery_comments; b text := btrim(coalesce(p_body, ''));
begin
  if exists (select 1 from public.gallery_shares where token = p_token) then raise exception 'Notes are only for the client.'; end if;
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

create or replace function public.gallery_log_download(p_token uuid, p_password text, p_pin text, p_photo uuid, p_kind text, p_files integer, p_label text, p_viewer text, p_name text)
returns text
language plpgsql security definer set search_path = '' as $$
declare g public.galleries; dl jsonb;
begin
  if exists (select 1 from public.gallery_shares where token = p_token) then return 'off'; end if;
  g := public.gallery_check(p_token, p_password);
  if g.id is null then return 'off'; end if;
  dl := coalesce(g.settings->'download', '{}'::jsonb);
  if coalesce((dl->>'on')::boolean, true) = false then return 'off'; end if;
  if coalesce((dl->>'pin_on')::boolean, false) and coalesce(dl->>'pin', '') <> '' and coalesce(p_pin, '') <> dl->>'pin' then return 'pin'; end if;
  if p_photo is not null and not exists (select 1 from public.gallery_photos p where p.id = p_photo and p.gallery_id = g.id) then return 'off'; end if;
  insert into public.gallery_downloads (studio_id, gallery_id, photo_id, kind, files, label, viewer, viewer_name)
  values (g.studio_id, g.id, p_photo, case when p_kind = 'zip' then 'zip' else 'photo' end, greatest(1, least(coalesce(p_files, 1), 100000)),
          left(coalesce(p_label, ''), 200), left(coalesce(p_viewer, ''), 200), left(coalesce(p_name, ''), 80));
  update public.galleries set downloads = downloads + greatest(1, least(coalesce(p_files, 1), 100000)) where id = g.id;
  return 'ok';
end $$;
