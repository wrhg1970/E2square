-- Fase 7c: comisiones de agentes.
-- Reglas (Will, 2026-11-20): cobran los agentes; % distinto por agente y producto; base venta o margen;
-- las aprueba el director o su superior (nadie aprueba su propia comisión).

insert into public.permissions (key, description) values
  ('commissions.manage', 'Definir porcentajes de comisión por agente y producto'),
  ('commissions.approve', 'Aprobar, rechazar y marcar como pagadas las comisiones')
on conflict (key) do nothing;

create or replace function public.grant_commission_permissions()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.role_permissions (organization_id, role_id, permission_key)
  select new.organization_id, new.id, m.perm
  from (values ('admin', 'commissions.manage'), ('sales_director', 'commissions.manage'), ('general_director', 'commissions.manage'),
               ('sales_director', 'commissions.approve'), ('general_director', 'commissions.approve')) m(role_key, perm)
  where m.role_key = new.key
  on conflict (role_id, permission_key) do nothing;
  return new;
end;
$$;
revoke execute on function public.grant_commission_permissions() from public, anon, authenticated;
create trigger roles_grant_commissions after insert on public.roles
for each row execute function public.grant_commission_permissions();

-- Roles que ya existen.
insert into public.role_permissions (organization_id, role_id, permission_key)
select r.organization_id, r.id, m.perm
from public.roles r
join (values ('admin', 'commissions.manage'), ('sales_director', 'commissions.manage'), ('general_director', 'commissions.manage'),
             ('sales_director', 'commissions.approve'), ('general_director', 'commissions.approve')) m(role_key, perm)
  on m.role_key = r.key
on conflict (role_id, permission_key) do nothing;

-- ============ Porcentajes por agente y producto ============
create table public.commission_rates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  profile_id uuid not null,
  product_id uuid not null,
  rate_pct numeric(5,2) not null check (rate_pct > 0 and rate_pct <= 100),
  basis text not null check (basis in ('sale', 'margin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (profile_id, product_id),
  foreign key (profile_id, organization_id) references public.profiles(id, organization_id),
  foreign key (product_id, organization_id) references public.products(id, organization_id)
);

-- ============ Comisiones generadas ============
create table public.commissions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  opportunity_id uuid not null,
  opportunity_item_id uuid not null unique,
  profile_id uuid not null,
  product_id uuid not null,
  basis text not null check (basis in ('sale', 'margin')),
  rate_pct numeric(5,2) not null,
  base_amount numeric(18,4) not null,
  amount numeric(18,4) not null,
  currency_code char(3) not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'paid')),
  decided_by uuid,
  decided_at timestamptz,
  decision_note text,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (opportunity_id, organization_id) references public.opportunities(id, organization_id),
  foreign key (profile_id, organization_id) references public.profiles(id, organization_id),
  foreign key (product_id, organization_id) references public.products(id, organization_id),
  foreign key (decided_by, organization_id) references public.profiles(id, organization_id)
);
create index commissions_org_status on public.commissions (organization_id, status, created_at desc);
create index commissions_profile on public.commissions (profile_id);

do $$
declare t text;
begin
  foreach t in array array['commission_rates', 'commissions'] loop
    execute format('create trigger %I_audit after insert or update or delete on public.%I for each row execute function public.audit_row()', t, t);
    execute format('create trigger %1$s_set_updated_at before update on public.%1$s for each row execute function public.set_updated_at()', t);
  end loop;
end $$;

alter table public.commission_rates enable row level security;
alter table public.commissions enable row level security;

-- El agente ve sus porcentajes y comisiones; quien administra o aprueba ve los de toda la organización.
create policy commission_rates_select on public.commission_rates for select to authenticated
  using (organization_id = public.current_org_id()
         and (profile_id = public.current_profile_id() or public.has_permission('commissions.manage') or public.has_permission('commissions.approve')));
create policy commission_rates_insert on public.commission_rates for insert to authenticated
  with check (organization_id = public.current_org_id() and public.has_permission('commissions.manage'));
create policy commission_rates_update on public.commission_rates for update to authenticated
  using (organization_id = public.current_org_id() and public.has_permission('commissions.manage'))
  with check (organization_id = public.current_org_id() and public.has_permission('commissions.manage'));
create policy commission_rates_delete on public.commission_rates for delete to authenticated
  using (organization_id = public.current_org_id() and public.has_permission('commissions.manage'));

-- Sin políticas de escritura: las comisiones solo nacen del trigger y cambian por decide_commission().
create policy commissions_select on public.commissions for select to authenticated
  using (organization_id = public.current_org_id()
         and (profile_id = public.current_profile_id() or public.has_permission('commissions.manage') or public.has_permission('commissions.approve')));

-- ============ Generación al ganar / limpieza al reabrir ============
create or replace function public.opportunity_commissions()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'won' and old.status <> 'won' and new.owner_id is not null then
    insert into public.commissions (organization_id, opportunity_id, opportunity_item_id, profile_id, product_id,
                                    basis, rate_pct, base_amount, amount, currency_code)
    select new.organization_id, new.id, i.id, new.owner_id, i.product_id, r.basis, r.rate_pct, b.base,
           round(b.base * r.rate_pct / 100, 2), new.currency_code
    from public.opportunity_items i
    join public.commission_rates r on r.profile_id = new.owner_id and r.product_id = i.product_id
    cross join lateral (select greatest(case r.basis when 'sale' then i.line_total else i.line_total - i.line_cost end, 0) as base) b
    where i.opportunity_id = new.id
    on conflict (opportunity_item_id) do nothing;
  elsif old.status = 'won' and new.status <> 'won' then
    if exists (select 1 from public.commissions where opportunity_id = new.id and status in ('approved', 'paid')) then
      raise exception 'La oportunidad tiene comisiones aprobadas o pagadas; no puede reabrirse.' using errcode = 'EB001';
    end if;
    delete from public.commissions where opportunity_id = new.id and status in ('pending', 'rejected');
  end if;
  return new;
end;
$$;
revoke execute on function public.opportunity_commissions() from public, anon, authenticated;
-- Sin "of status": el estado lo cambia un trigger BEFORE, no la columna del UPDATE.
create trigger opportunities_commissions after update on public.opportunities
for each row when (old.status is distinct from new.status) execute function public.opportunity_commissions();

-- ============ Aprobación ============
-- pending -> approved | rejected; approved -> paid. Nunca sobre la propia comisión.
create or replace function public.decide_commission(p_id uuid, p_status text, p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  c public.commissions;
  me uuid := public.current_profile_id();
begin
  if not public.has_permission('commissions.approve') then
    raise exception 'No tienes permiso para aprobar comisiones.' using errcode = 'EB001';
  end if;
  select * into c from public.commissions where id = p_id and organization_id = public.current_org_id() for update;
  if c.id is null then
    raise exception 'La comisión no existe.' using errcode = 'EB001';
  end if;
  if c.profile_id = me then
    raise exception 'No puedes aprobar tu propia comisión.' using errcode = 'EB001';
  end if;
  if not ((c.status = 'pending' and p_status in ('approved', 'rejected')) or (c.status = 'approved' and p_status = 'paid')) then
    raise exception 'Cambio de estado no permitido.' using errcode = 'EB001';
  end if;
  if p_status = 'rejected' and coalesce(trim(p_note), '') = '' then
    raise exception 'Indica el motivo del rechazo.' using errcode = 'EB001';
  end if;

  update public.commissions set
    status = p_status,
    decided_by = case when p_status = 'paid' then decided_by else me end,
    decided_at = case when p_status = 'paid' then decided_at else now() end,
    decision_note = coalesce(nullif(trim(p_note), ''), decision_note),
    paid_at = case when p_status = 'paid' then now() end
  where id = p_id;
end;
$$;
revoke execute on function public.decide_commission(uuid, text, text) from public, anon;
grant execute on function public.decide_commission(uuid, text, text) to authenticated;
