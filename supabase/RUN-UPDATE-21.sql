-- Jovita update 21: small tidy-ups from the health check.
-- Paste into Supabase › SQL Editor › New query and press Run. Safe to run more than once.

-- Only Jovita itself needs to know another studio's extra storage
revoke execute on function public.addon_bytes(uuid) from authenticated;

-- Faster lookups on links between tables (Supabase's performance advisor)
create index if not exists admin_notifications_studio_idx on public.admin_notifications (studio_id);
create index if not exists billing_payments_studio_idx on public.billing_payments (studio_id);
create index if not exists gallery_comments_photo_idx on public.gallery_comments (photo_id);
create index if not exists gallery_downloads_photo_idx on public.gallery_downloads (photo_id);
create index if not exists plan_gifts_studio_idx on public.plan_gifts (studio_id);
