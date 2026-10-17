-- TESTING ONLY: confirm new sign-ups instantly so nobody waits for an email.
-- Before launch, turn verification back on with:
--   drop trigger if exists autoconfirm_before_insert on auth.users;
create or replace function public.autoconfirm_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.email_confirmed_at is null then new.email_confirmed_at := now(); end if;
  return new;
end $$;
revoke all on function public.autoconfirm_new_user() from public, anon, authenticated;
drop trigger if exists autoconfirm_before_insert on auth.users;
create trigger autoconfirm_before_insert before insert on auth.users
  for each row execute function public.autoconfirm_new_user();

-- A ready-made demo login: demo@jovita.app / JovitaDemo2026
do $$
declare uid uuid := gen_random_uuid();
begin
  if not exists (select 1 from auth.users where email = 'demo@jovita.app') then
    insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change, email_change_token_current, phone_change, phone_change_token, reauthentication_token)
    values ('00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated', 'demo@jovita.app',
      extensions.crypt('JovitaDemo2026', extensions.gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}', '{"first_name":"Ada","studio_name":"Ada Lens Studio"}', now(), now(),
      '', '', '', '', '', '', '', '');
    insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    values (gen_random_uuid(), uid, uid::text, jsonb_build_object('sub', uid::text, 'email', 'demo@jovita.app', 'email_verified', true), 'email', now(), now(), now());
  end if;
end $$;
