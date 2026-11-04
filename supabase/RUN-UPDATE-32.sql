-- Jovita update 32: saved watermark designs, "send the contract automatically on booking",
-- and galleries that stay locked until the contract is signed and / or the invoices are paid.
-- Paste into Supabase › SQL Editor › New query (project: jovita) and press Run. Safe to run more than once.

-- Part 1: two new studio settings
alter table public.studios add column if not exists watermarks jsonb not null default '[]'::jsonb;
alter table public.studios add column if not exists auto_contract boolean not null default false;

-- Part 2: the client's gallery page checks the lock (gallery settings "gate": {contract, paid})
do $$
declare d text;
begin
  d := pg_get_functiondef('public.open_gallery'::regproc);
  if position('gate_needs' in d) = 0 then
    d := replace(d, E'  studio jsonb;\nbegin', E'  studio jsonb;\n  gpr public.projects;\n  gate_needs text[] := ''{}'';\nbegin');
    d := replace(d, E'  if sh.id is not null then\n    update public.gallery_shares',
E'  -- Locked until the contract is signed and / or everything is paid (set in the gallery\'s Privacy tab)
  if g.project_id is not null and (coalesce((g.settings->\'gate\'->>\'contract\')::boolean, false) or coalesce((g.settings->\'gate\'->>\'paid\')::boolean, false)) then
    select * into gpr from public.projects where id = g.project_id;
    if gpr.id is not null then
      if coalesce((g.settings->\'gate\'->>\'contract\')::boolean, false) and not coalesce(gpr.contract_signed, false) then
        gate_needs := gate_needs || \'contract\'::text;
      end if;
      if coalesce((g.settings->\'gate\'->>\'paid\')::boolean, false) and exists (
        select 1 from public.invoices i where i.project_id = gpr.id and i.kind <> \'quote\' and i.status = \'sent\'
          and coalesce(i.amount, 0) - coalesce(i.amount_paid, 0) > 0.009) then
        gate_needs := gate_needs || \'paid\'::text;
      end if;
      if array_length(gate_needs, 1) > 0 then
        return jsonb_build_object(\'error\', \'locked\', \'needs\', to_jsonb(gate_needs), \'title\', g.title, \'event_date\', g.event_date,
          \'cover_path\', coalesce(g.cover_path, (select p.path from public.gallery_photos p where p.gallery_id = g.id order by p.position limit 1)),
          \'studio\', studio);
      end if;
    end if;
  end if;

  if sh.id is not null then
    update public.gallery_shares');
    if position('''locked''' in d) = 0 or position('gpr public.projects' in d) = 0 then
      raise exception 'Could not update open_gallery: tell Claude';
    end if;
    execute d;
  end if;
end $$;
