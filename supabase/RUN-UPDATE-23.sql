-- Jovita update 23: email the client when someone sends their picks back.
-- Run update 22 first. Paste into Supabase › SQL Editor › New query and press Run. Safe to run more than once.

-- Part 1: remember when the client was emailed, so each send emails once
alter table public.gallery_share_replies add column if not exists notified_at timestamptz;

-- Part 2: sending again clears the "emailed" mark, so the client gets a fresh email
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
  on conflict (share_id, guest) do update set guest_name = excluded.guest_name, message = excluded.message, sent_at = now(), seen_at = null, notified_at = null;
  return jsonb_build_object('ok', true, 'picks', n, 'to', coalesce(nullif(sh.viewer_name, ''), 'them'));
end $$;
revoke all on function public.gallery_share_reply(uuid, text, text, text) from public;
grant execute on function public.gallery_share_reply(uuid, text, text, text) to anon, authenticated;

-- Part 3: opening the email's link on another phone or laptop still shows the client their own selection
create or replace function public.gallery_share_owner(p_token uuid, p_password text, p_share uuid)
returns text
language plpgsql stable security definer set search_path = '' as $$
declare g public.galleries; v text;
begin
  g := public.gallery_check(p_token, p_password);
  if g.id is null then return null; end if;
  select s.viewer into v from public.gallery_shares s where s.token = p_share and s.gallery_id = g.id;
  return v;
end $$;
revoke all on function public.gallery_share_owner(uuid, text, uuid) from public;
grant execute on function public.gallery_share_owner(uuid, text, uuid) to anon, authenticated;
