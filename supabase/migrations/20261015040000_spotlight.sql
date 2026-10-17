-- Spotlight: Photographer of the week, featured projects and stories. Anyone can read what's published
-- (logged in or not). Only the Jovita team (admins) can write. Photos live in the public "spotlight" bucket.

create table if not exists public.spotlights (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  kind text not null default 'feature' check (kind in ('creative_of_week', 'feature', 'story')),
  title text not null check (char_length(title) between 1 and 140),
  dek text not null default '' check (char_length(dek) <= 300),          -- the line under the title
  person_name text not null default '',
  person_role text not null default '',                                   -- Photographer, Videographer, Makeup artist…
  location text not null default '',
  instagram text not null default '',
  website text not null default '',
  cover_path text,
  photos jsonb not null default '[]'::jsonb,                              -- [{ "path": "...", "caption": "..." }]
  body text not null default '' check (char_length(body) <= 20000),     -- paragraphs separated by blank lines
  published boolean not null default false,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists spotlights_pub_idx on public.spotlights (published, published_at desc);
alter table public.spotlights enable row level security;
drop policy if exists "anyone reads published spotlights" on public.spotlights;
create policy "anyone reads published spotlights" on public.spotlights for select to anon using (published);
drop policy if exists "members read published spotlights" on public.spotlights;
create policy "members read published spotlights" on public.spotlights for select to authenticated using (published or (select public.is_admin()));
drop policy if exists "admins write spotlights" on public.spotlights;
create policy "admins write spotlights" on public.spotlights for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

-- Stamp the publish date the first time a post goes live
create or replace function public.spotlight_stamp()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  if new.published and new.published_at is null then new.published_at := now(); end if;
  return new;
end $$;
drop trigger if exists spotlight_stamp on public.spotlights;
create trigger spotlight_stamp before insert or update on public.spotlights for each row execute function public.spotlight_stamp();

-- Photos: public to view, only admins upload or remove
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('spotlight', 'spotlight', true, 15728640, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;
drop policy if exists "admins upload spotlight" on storage.objects;
create policy "admins upload spotlight" on storage.objects for insert to authenticated with check (bucket_id = 'spotlight' and (select public.is_admin()));
drop policy if exists "admins change spotlight" on storage.objects;
create policy "admins change spotlight" on storage.objects for update to authenticated using (bucket_id = 'spotlight' and (select public.is_admin()));
drop policy if exists "admins remove spotlight" on storage.objects;
create policy "admins remove spotlight" on storage.objects for delete to authenticated using (bucket_id = 'spotlight' and (select public.is_admin()));
