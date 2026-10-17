-- Jovita v2.2: studio logo, gallery invites with view tracking, public client gallery

-- Studio logo (shown on invoices, contracts and the client portal)
alter table public.studios add column if not exists logo_path text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('studio-assets', 'studio-assets', true, 5242880, array['image/png','image/jpeg','image/webp','image/svg+xml'])
on conflict (id) do nothing;

drop policy if exists "studio uploads assets" on storage.objects;
create policy "studio uploads assets" on storage.objects for insert to authenticated
  with check (bucket_id = 'studio-assets' and (storage.foldername(name))[1] = (select public.my_studio_id())::text);
drop policy if exists "studio changes assets" on storage.objects;
create policy "studio changes assets" on storage.objects for update to authenticated
  using (bucket_id = 'studio-assets' and (storage.foldername(name))[1] = (select public.my_studio_id())::text);
drop policy if exists "studio removes assets" on storage.objects;
create policy "studio removes assets" on storage.objects for delete to authenticated
  using (bucket_id = 'studio-assets' and (storage.foldername(name))[1] = (select public.my_studio_id())::text);

-- Every gallery gets a private share link
alter table public.galleries add column if not exists share_token uuid not null default gen_random_uuid();
create unique index if not exists galleries_share_token_idx on public.galleries (share_token);

-- People invited to view a gallery, each with their own link so we know who opened it
create table if not exists public.gallery_invites (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references public.studios(id) on delete cascade,
  gallery_id uuid not null references public.galleries(id) on delete cascade,
  email text not null check (char_length(email) between 3 and 254),
  name text not null default '',
  token uuid not null default gen_random_uuid() unique,
  invited_at timestamptz not null default now(),
  first_viewed_at timestamptz,
  last_viewed_at timestamptz,
  views integer not null default 0,
  unique (gallery_id, email)
);
create index if not exists gallery_invites_gallery_idx on public.gallery_invites (gallery_id);
create index if not exists gallery_invites_studio_idx on public.gallery_invites (studio_id);
alter table public.gallery_invites enable row level security;
drop policy if exists "studio rows" on public.gallery_invites;
create policy "studio rows" on public.gallery_invites for all to authenticated
  using (studio_id = (select public.my_studio_id())) with check (studio_id = (select public.my_studio_id()));

-- The client-facing gallery. Opens with the gallery link or a personal invite link, and records the view.
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
    return jsonb_build_object('error', 'password', 'title', g.title);
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
    'photos', coalesce((select jsonb_agg(jsonb_build_object('path', p.path, 'set_id', p.set_id, 'width', p.width, 'height', p.height) order by p.position)
      from public.gallery_photos p where p.gallery_id = g.id), '[]'::jsonb)
  );
end $$;
revoke all on function public.open_gallery(uuid, text) from public;
grant execute on function public.open_gallery(uuid, text) to anon, authenticated;

-- Client portal: include the studio logo
create or replace function public.get_portal(p_token uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'project', jsonb_build_object('id', p.id, 'title', p.title, 'type', p.type, 'stage', p.stage, 'session_date', p.session_date,
       'amount', p.amount, 'currency', p.currency, 'contract_signed', p.contract_signed, 'deposit_paid', p.deposit_paid,
       'gallery_delivered', p.gallery_delivered, 'release_signed', p.release_signed),
    'client', jsonb_build_object('name', c.name),
    'studio', jsonb_build_object('name', s.name, 'logo_path', s.logo_path, 'pay_paystack', s.pay_paystack, 'pay_flutterwave', s.pay_flutterwave, 'pay_stripe', s.pay_stripe, 'pay_transfer', s.pay_transfer, 'bank_details', s.bank_details),
    'contract', (select t.body from public.templates t where t.studio_id = p.studio_id and t.kind = 'contract'
                  and (t.id = p.contract_template_id or (p.contract_template_id is null and t.is_default)) order by (t.id = p.contract_template_id) desc limit 1),
    'release', (select t.body from public.templates t where t.studio_id = p.studio_id and t.kind = 'model_release'
                  and (t.id = p.release_template_id or (p.release_template_id is null and t.is_default)) order by (t.id = p.release_template_id) desc limit 1),
    'invoices', coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'number', i.number, 'label', i.label, 'amount', i.amount, 'currency', i.currency,
        'due_date', i.due_date, 'status', i.status, 'payment_reported_at', i.payment_reported_at, 'items', i.items, 'notes', i.notes) order by i.due_date)
        from public.invoices i where i.project_id = p.id and i.status in ('sent','paid')), '[]'::jsonb),
    'booking', (select jsonb_build_object('starts_at', b.starts_at, 'location', b.location) from public.bookings b where b.project_id = p.id order by b.starts_at limit 1),
    'gallery', (select jsonb_build_object('title', g.title, 'photo_count', g.photo_count, 'status', g.status, 'share_token', g.share_token) from public.galleries g where g.project_id = p.id and g.status = 'delivered' limit 1)
  )
  from public.projects p
  join public.clients c on c.id = p.client_id
  join public.studios s on s.id = p.studio_id
  where p.portal_token = p_token
$$;
