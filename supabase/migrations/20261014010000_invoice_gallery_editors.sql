-- Jovita v2.1: full invoice editor and gallery editor (photo sets, design, settings, uploads)

-- Invoices: line items, notes, discount, tax, payment schedule, methods, reminders, tips
alter table public.invoices
  add column if not exists items jsonb not null default '[]'::jsonb,
  add column if not exists notes text not null default '',
  add column if not exists discount numeric(14,2) not null default 0,
  add column if not exists discount_type text not null default 'amount' check (discount_type in ('amount','percent')),
  add column if not exists tax_rate numeric(6,3) not null default 0,
  add column if not exists schedule jsonb not null default '[]'::jsonb,
  add column if not exists methods jsonb not null default '["transfer"]'::jsonb,
  add column if not exists reminder_days integer[] not null default '{-7,0,3,7,14}',
  add column if not exists allow_tip boolean not null default false,
  add column if not exists updated_at timestamptz not null default now();

-- Galleries: event date, cover, photo sets, design and settings
alter table public.galleries
  add column if not exists event_date date,
  add column if not exists cover_path text,
  add column if not exists sets jsonb not null default '[{"id":"highlights","name":"Highlights","description":""}]'::jsonb,
  add column if not exists design jsonb not null default '{}'::jsonb,
  add column if not exists settings jsonb not null default '{}'::jsonb,
  add column if not exists slug text,
  add column if not exists updated_at timestamptz not null default now();

-- Photos in a gallery (files live in Storage under <studio_id>/<gallery_id>/...)
create table if not exists public.gallery_photos (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references public.studios(id) on delete cascade,
  gallery_id uuid not null references public.galleries(id) on delete cascade,
  set_id text not null default 'highlights',
  path text not null,
  name text not null default '',
  width integer,
  height integer,
  position integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists gallery_photos_gallery_idx on public.gallery_photos (gallery_id);
create index if not exists gallery_photos_studio_idx on public.gallery_photos (studio_id);
alter table public.gallery_photos enable row level security;
drop policy if exists "studio rows" on public.gallery_photos;
create policy "studio rows" on public.gallery_photos for all to authenticated
  using (studio_id = (select public.my_studio_id())) with check (studio_id = (select public.my_studio_id()));

-- Storage bucket for gallery photos. Public read (paths are unguessable), owners write only to their own folder.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('gallery-photos', 'gallery-photos', true, 52428800, array['image/jpeg','image/png','image/webp','image/heic','image/heif'])
on conflict (id) do nothing;

drop policy if exists "studio uploads gallery photos" on storage.objects;
create policy "studio uploads gallery photos" on storage.objects for insert to authenticated
  with check (bucket_id = 'gallery-photos' and (storage.foldername(name))[1] = (select public.my_studio_id())::text);
drop policy if exists "studio changes gallery photos" on storage.objects;
create policy "studio changes gallery photos" on storage.objects for update to authenticated
  using (bucket_id = 'gallery-photos' and (storage.foldername(name))[1] = (select public.my_studio_id())::text);
drop policy if exists "studio removes gallery photos" on storage.objects;
create policy "studio removes gallery photos" on storage.objects for delete to authenticated
  using (bucket_id = 'gallery-photos' and (storage.foldername(name))[1] = (select public.my_studio_id())::text);
