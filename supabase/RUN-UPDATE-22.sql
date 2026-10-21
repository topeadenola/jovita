-- Jovita update 22: named selections, and picks sent back.
-- A client names their selection ("Our album picks") before sharing it, and can rename it later.
-- Whoever they share it with (a fiancé, a planner) hearts their favourites and sends them back with a short note.
-- The client then sees those picks in their own gallery and can add them to their favourites in one tap.
-- Paste each part into Supabase › SQL Editor › New query and press Run. Safe to run more than once.

-- Part 1: a name for each shared selection, and the picks people send back
alter table public.gallery_shares add column if not exists title text not null default '';

create table if not exists public.gallery_share_replies (
  id uuid primary key default gen_random_uuid(),
  share_id uuid not null references public.gallery_shares(id) on delete cascade,
  studio_id uuid not null references public.studios(id) on delete cascade,
  gallery_id uuid not null references public.galleries(id) on delete cascade,
  guest text not null,                 -- the guest's email
  guest_name text not null default '',
  message text not null default '',
  sent_at timestamptz not null default now(),
  seen_at timestamptz,
  unique (share_id, guest)
);
create index if not exists gallery_share_replies_studio_idx on public.gallery_share_replies (studio_id);
create index if not exists gallery_share_replies_gallery_idx on public.gallery_share_replies (gallery_id);
alter table public.gallery_share_replies enable row level security;
drop policy if exists "studio rows" on public.gallery_share_replies;
create policy "studio rows" on public.gallery_share_replies for select to authenticated using (studio_id = (select public.my_studio_id()));

-- Part 2: make (or reuse) the share link, with a name
create or replace function public.gallery_share_selection(p_token uuid, p_password text, p_viewer text, p_name text, p_title text)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare g public.galleries; v text := left(coalesce(p_viewer, ''), 200); t uuid; ttl text := left(btrim(coalesce(p_title, '')), 80);
begin
  if exists (select 1 from public.gallery_shares where token = p_token) then raise exception 'Only the client can share this selection.'; end if;
  g := public.gallery_check(p_token, p_password);
  if g.id is null or length(v) < 3 then raise exception 'This gallery is not available.'; end if;
  if not exists (select 1 from public.gallery_favorites f where f.gallery_id = g.id and f.viewer = v) then raise exception 'Pick some favourites first.'; end if;
  insert into public.gallery_shares (studio_id, gallery_id, viewer, viewer_name, title)
  values (g.studio_id, g.id, v, left(coalesce(p_name, ''), 80), ttl)
  on conflict (gallery_id, viewer) do update
    set viewer_name = coalesce(nullif(excluded.viewer_name, ''), public.gallery_shares.viewer_name),
        title = case when excluded.title <> '' then excluded.title else public.gallery_shares.title end
  returning token into t;
  return t;
end $$;
revoke all on function public.gallery_share_selection(uuid, text, text, text, text) from public;
grant execute on function public.gallery_share_selection(uuid, text, text, text, text) to anon, authenticated;

-- Part 3: the client's own shared selection, and what came back (names and picks only, never guests' emails)
create or replace function public.gallery_share_info(p_token uuid, p_password text, p_viewer text)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare g public.galleries; sh public.gallery_shares; v text := left(coalesce(p_viewer, ''), 200);
begin
  if exists (select 1 from public.gallery_shares where token = p_token) then return null; end if;
  g := public.gallery_check(p_token, p_password);
  if g.id is null or length(v) < 3 then return null; end if;
  select * into sh from public.gallery_shares where gallery_id = g.id and viewer = v;
  if sh.id is null then return null; end if;
  return jsonb_build_object(
    'token', sh.token, 'title', sh.title, 'views', sh.views,
    'replies', coalesce((select jsonb_agg(jsonb_build_object(
        'id', r.id, 'name', coalesce(nullif(r.guest_name, ''), 'Someone'), 'message', r.message, 'sent_at', r.sent_at, 'seen', r.seen_at is not null,
        'picks', coalesce((select jsonb_agg(f.photo_id) from public.gallery_favorites f where f.gallery_id = g.id and f.viewer = r.guest
                             and exists (select 1 from public.gallery_favorites o where o.photo_id = f.photo_id and o.viewer = sh.viewer)), '[]'::jsonb))
        order by r.sent_at desc) from public.gallery_share_replies r where r.share_id = sh.id), '[]'::jsonb));
end $$;
revoke all on function public.gallery_share_info(uuid, text, text) from public;
grant execute on function public.gallery_share_info(uuid, text, text) to anon, authenticated;

-- The client has looked at the picks sent back
create or replace function public.gallery_share_seen(p_token uuid, p_password text, p_viewer text)
returns void
language plpgsql security definer set search_path = '' as $$
declare g public.galleries; v text := left(coalesce(p_viewer, ''), 200);
begin
  g := public.gallery_check(p_token, p_password);
  if g.id is null then return; end if;
  update public.gallery_share_replies r set seen_at = now()
   from public.gallery_shares s where r.share_id = s.id and s.gallery_id = g.id and s.viewer = v and r.seen_at is null;
end $$;
revoke all on function public.gallery_share_seen(uuid, text, text) from public;
grant execute on function public.gallery_share_seen(uuid, text, text) to anon, authenticated;

-- Part 4: a guest sends their picks back (send again to update the note)
create or replace function public.gallery_share_reply(p_token uuid, p_viewer text, p_name text, p_message text)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare sh public.gallery_shares; g public.galleries; v text := left(lower(btrim(coalesce(p_viewer, ''))), 200); n int;
begin
  select * into sh from public.gallery_shares where token = p_token;
  if sh.id is null then raise exception 'This link is not available.'; end if;
  g := public.gallery_check(p_token, null);
  if g.id is null then raise exception 'This gallery is not available.'; end if;
  if v !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Enter your email first.'; end if;
  select count(*) into n from public.gallery_favorites f where f.gallery_id = g.id and f.viewer = v;
  if n = 0 then raise exception 'Heart a few photos first.'; end if;
  insert into public.gallery_share_replies (share_id, studio_id, gallery_id, guest, guest_name, message)
  values (sh.id, sh.studio_id, sh.gallery_id, v, left(coalesce(p_name, ''), 80), left(btrim(coalesce(p_message, '')), 500))
  on conflict (share_id, guest) do update set guest_name = excluded.guest_name, message = excluded.message, sent_at = now(), seen_at = null;
  return jsonb_build_object('ok', true, 'picks', n, 'to', coalesce(nullif(sh.viewer_name, ''), 'them'));
end $$;
revoke all on function public.gallery_share_reply(uuid, text, text, text) from public;
grant execute on function public.gallery_share_reply(uuid, text, text, text) to anon, authenticated;

-- Part 5: the shared page shows the selection's name
do $do$
declare d text := pg_get_functiondef('public.open_gallery(uuid, text)'::regprocedure);
begin
  if position('''title'', sh.title' in d) > 0 then return; end if;
  d := replace(d, $a$'share', jsonb_build_object('by', coalesce(nullif(sh.viewer_name, ''), 'Your friend'))$a$,
                  $b$'share', jsonb_build_object('by', coalesce(nullif(sh.viewer_name, ''), 'Your friend'), 'title', sh.title)$b$);
  if position('''title'', sh.title' in d) = 0 then raise exception 'open_gallery was not as expected; nothing changed'; end if;
  execute d;
end $do$;
