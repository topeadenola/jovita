-- Jovita update 28: see who opened each gallery, and when (Gallery › Activity › View activity).
-- Every visit is recorded: invited people by their email, visitors on the open link by their email once they give it.
-- Opening a gallery again within 30 minutes counts as the same visit. Only the studio sees this.
-- Paste into Supabase › SQL Editor › New query (project: jovita) and press Run. Safe to run more than once.

create table if not exists public.gallery_views (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references public.studios(id) on delete cascade,
  gallery_id uuid not null references public.galleries(id) on delete cascade,
  viewer text not null default '',
  viewer_name text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists gallery_views_gallery_idx on public.gallery_views (gallery_id, created_at desc);
create index if not exists gallery_views_studio_idx on public.gallery_views (studio_id);
alter table public.gallery_views enable row level security;
drop policy if exists "studio rows" on public.gallery_views;
create policy "studio rows" on public.gallery_views for select to authenticated using (studio_id = (select public.my_studio_id()));

create or replace function public.gallery_log_view(p_token uuid, p_password text, p_viewer text, p_name text)
returns void
language plpgsql security definer set search_path = '' as $$
declare g public.galleries; v text := left(lower(btrim(coalesce(p_viewer, ''))), 200); n text := left(btrim(coalesce(p_name, '')), 80);
begin
  g := public.gallery_check(p_token, p_password);
  if g.id is null or v = '' then return; end if;
  -- the same person opening it again within 30 minutes is one visit (keep the name if they give it later)
  update public.gallery_views set viewer_name = case when n <> '' then n else viewer_name end
   where id = (select id from public.gallery_views where gallery_id = g.id and viewer = v and created_at > now() - interval '30 minutes' order by created_at desc limit 1);
  if found then return; end if;
  insert into public.gallery_views (studio_id, gallery_id, viewer, viewer_name) values (g.studio_id, g.id, v, n);
end $$;
revoke all on function public.gallery_log_view(uuid, text, text, text) from public;
grant execute on function public.gallery_log_view(uuid, text, text, text) to anon, authenticated;
