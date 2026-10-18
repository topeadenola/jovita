-- Jovita gallery update (9): favourites, notes, downloads, file names, videos, yearly plans, Inbox email.
-- In Supabase › SQL Editor: open a NEW query, press Cmd+A then Cmd+V to paste this, then press Run. Safe to run more than once.

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

-- Jovita update 9: client favourites and comments on each photo, videos in galleries, original file names.
-- Safe to run more than once.

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

-- ---------- Download activity (who downloaded what) and the download PIN ----------
create table if not exists public.gallery_downloads (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references public.studios(id) on delete cascade,
  gallery_id uuid not null references public.galleries(id) on delete cascade,
  photo_id uuid references public.gallery_photos(id) on delete set null, -- null for a zip of many
  kind text not null default 'photo' check (kind in ('photo', 'zip')),
  files integer not null default 1,
  label text not null default '',          -- the file name, or "All photos" / a set name for a zip
  viewer text not null default '',
  viewer_name text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists gallery_downloads_gallery_idx on public.gallery_downloads (gallery_id);
create index if not exists gallery_downloads_studio_idx on public.gallery_downloads (studio_id);
alter table public.gallery_downloads enable row level security;
drop policy if exists "studio rows" on public.gallery_downloads;
create policy "studio rows" on public.gallery_downloads for all to authenticated
  using (studio_id = (select public.my_studio_id())) with check (studio_id = (select public.my_studio_id()));

-- Called just before a client downloads. Checks downloads are on and the PIN (if any), then records it.
-- Returns 'ok', 'pin' (PIN needed or wrong) or 'off' (downloads switched off).
create or replace function public.gallery_log_download(p_token uuid, p_password text, p_pin text, p_photo uuid, p_kind text, p_files integer, p_label text, p_viewer text, p_name text)
returns text language plpgsql security definer set search_path = '' as $$
declare g public.galleries; dl jsonb;
begin
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
revoke all on function public.gallery_log_download(uuid, text, text, uuid, text, integer, text, text, text) from public;
grant execute on function public.gallery_log_download(uuid, text, text, uuid, text, integer, text, text, text) to anon, authenticated;
