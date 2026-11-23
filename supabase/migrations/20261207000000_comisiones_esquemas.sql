-- Comisiones: reparto entre agentes, bono por institución nueva, pago condicionado a cobranza y escalones por meta.
-- Will (2026-11-23) confirmó que usan los cuatro esquemas. Reglas PROPUESTAS (por confirmar):
--   * Reparto: el responsable de la oportunidad puede ceder un % a otros agentes mientras no esté ganada.
--     Cada quien cobra su % de la base con SU porcentaje de comisión del producto; el responsable se queda con el resto.
--   * Bono por institución nueva: monto fijo para el responsable cuando la institución gana su primera oportunidad.
--   * Cobranza: si está activada (por omisión sí), una comisión de venta o bono solo se marca pagada
--     cuando quien aprueba registró que el cliente pagó la oportunidad.
--   * Escalones: al cerrar una meta de venta o margen con responsable, se paga un % extra sobre lo logrado
--     según el escalón más alto alcanzado (p. ej. 100% de la meta = +1%, 120% = +2%). Lo calcula quien aprueba.

-- ============ Configuración por organización ============
create table public.commission_settings (
  organization_id uuid primary key references public.organizations(id),
  new_institution_bonus numeric(18,2) not null default 0 check (new_institution_bonus >= 0),
  bonus_currency char(3) not null default 'MXN' check (bonus_currency ~ '^[A-Z]{3}$'),
  require_collection boolean not null default true,
  tiers jsonb not null default '[]' check (jsonb_typeof(tiers) = 'array'),
  updated_at timestamptz not null default now()
);
create trigger commission_settings_audit after insert or update or delete on public.commission_settings
for each row execute function public.audit_row();
create trigger commission_settings_set_updated_at before update on public.commission_settings
for each row execute function public.set_updated_at();
alter table public.commission_settings enable row level security;
create policy commission_settings_select on public.commission_settings for select to authenticated
  using (organization_id = public.current_org_id());
create policy commission_settings_insert on public.commission_settings for insert to authenticated
  with check (organization_id = public.current_org_id() and public.has_permission('commissions.manage'));
create policy commission_settings_update on public.commission_settings for update to authenticated
  using (organization_id = public.current_org_id() and public.has_permission('commissions.manage'))
  with check (organization_id = public.current_org_id() and public.has_permission('commissions.manage'));

-- Configuración vigente (con valores por omisión si la organización no ha guardado nada).
create or replace function public.org_commission_settings(p_org uuid)
returns public.commission_settings language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select s from public.commission_settings s where s.organization_id = p_org),
    row(p_org, 0, 'MXN', true, '[]'::jsonb, now())::public.commission_settings)
$$;
revoke execute on function public.org_commission_settings(uuid) from public, anon, authenticated;

-- ============ Comisiones: nuevos tipos ============
alter table public.goals add constraint goals_id_org unique (id, organization_id);
alter table public.commissions
  add column kind text not null default 'sale' check (kind in ('sale', 'new_institution', 'tier')),
  add column share_pct numeric(5,2) not null default 100 check (share_pct > 0 and share_pct <= 100),
  add column goal_id uuid unique,
  add foreign key (goal_id, organization_id) references public.goals(id, organization_id),
  alter column opportunity_id drop not null,
  alter column opportunity_item_id drop not null,
  alter column product_id drop not null,
  alter column basis drop not null,
  alter column rate_pct drop not null,
  alter column base_amount drop not null,
  drop constraint commissions_opportunity_item_id_key,
  add constraint commissions_item_profile unique (opportunity_item_id, profile_id),
  add constraint commissions_kind_fields check (case kind
    when 'sale' then opportunity_item_id is not null and product_id is not null and basis is not null and rate_pct is not null and base_amount is not null
    when 'new_institution' then opportunity_id is not null
    else goal_id is not null and basis is not null and rate_pct is not null and base_amount is not null end);
create unique index commissions_bonus_once on public.commissions (opportunity_id) where kind = 'new_institution';

-- ============ Reparto ============
create table public.opportunity_splits (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  opportunity_id uuid not null,
  profile_id uuid not null,
  share_pct numeric(5,2) not null check (share_pct > 0 and share_pct < 100),
  created_at timestamptz not null default now(),
  unique (opportunity_id, profile_id),
  foreign key (opportunity_id, organization_id) references public.opportunities(id, organization_id) on delete cascade,
  foreign key (profile_id, organization_id) references public.profiles(id, organization_id)
);
create trigger opportunity_splits_audit after insert or update or delete on public.opportunity_splits
for each row execute function public.audit_row();

create or replace function public.opportunity_splits_guard()
returns trigger language plpgsql set search_path = '' as $$
declare o public.opportunities;
begin
  select * into o from public.opportunities where id = coalesce(new.opportunity_id, old.opportunity_id);
  if o.status = 'won' then
    raise exception 'La oportunidad ya está ganada; el reparto no se puede cambiar.' using errcode = 'EB001';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  if new.profile_id = o.owner_id then
    raise exception 'El responsable ya cobra el resto; elige a otro agente.' using errcode = 'EB001';
  end if;
  if (select coalesce(sum(share_pct), 0) from public.opportunity_splits
      where opportunity_id = new.opportunity_id and id <> new.id) + new.share_pct >= 100 then
    raise exception 'El reparto debe dejarle algo al responsable (menos de 100%% en total).' using errcode = 'EB001';
  end if;
  return new;
end $$;
create trigger opportunity_splits_guard before insert or update or delete on public.opportunity_splits
for each row execute function public.opportunity_splits_guard();

alter table public.opportunity_splits enable row level security;
create policy opportunity_splits_select on public.opportunity_splits for select to authenticated
  using (organization_id = public.current_org_id() and public.can_see_opportunity_id(opportunity_id));
-- Edita el reparto el responsable de la oportunidad o quien administra comisiones.
create policy opportunity_splits_insert on public.opportunity_splits for insert to authenticated
  with check (organization_id = public.current_org_id() and public.can_see_opportunity_id(opportunity_id)
    and (public.has_permission('commissions.manage')
         or exists (select 1 from public.opportunities o where o.id = opportunity_id and o.owner_id = public.current_profile_id())));
create policy opportunity_splits_delete on public.opportunity_splits for delete to authenticated
  using (organization_id = public.current_org_id() and public.can_see_opportunity_id(opportunity_id)
    and (public.has_permission('commissions.manage')
         or exists (select 1 from public.opportunities o where o.id = opportunity_id and o.owner_id = public.current_profile_id())));

-- ============ Cobranza ============
-- Sin políticas de escritura: solo mark_opportunity_collected() registra o quita el pago del cliente.
create table public.opportunity_collections (
  opportunity_id uuid primary key,
  organization_id uuid not null references public.organizations(id),
  collected_on date not null,
  marked_by uuid not null,
  created_at timestamptz not null default now(),
  foreign key (opportunity_id, organization_id) references public.opportunities(id, organization_id) on delete cascade,
  foreign key (marked_by, organization_id) references public.profiles(id, organization_id)
);
create trigger opportunity_collections_audit after insert or update or delete on public.opportunity_collections
for each row execute function public.audit_row();
alter table public.opportunity_collections enable row level security;
create policy opportunity_collections_select on public.opportunity_collections for select to authenticated
  using (organization_id = public.current_org_id() and public.can_see_opportunity_id(opportunity_id));

create or replace function public.mark_opportunity_collected(p_opportunity uuid, p_collected boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare o public.opportunities;
begin
  if not public.has_permission('commissions.approve') then
    raise exception 'No tienes permiso para registrar cobranza.' using errcode = 'EB001';
  end if;
  select * into o from public.opportunities where id = p_opportunity and organization_id = public.current_org_id();
  if o.id is null then
    raise exception 'Oportunidad no encontrada.' using errcode = 'EB001';
  end if;
  if o.status <> 'won' then
    raise exception 'Solo se registra el pago de oportunidades ganadas.' using errcode = 'EB001';
  end if;
  if p_collected then
    insert into public.opportunity_collections (opportunity_id, organization_id, collected_on, marked_by)
    values (o.id, o.organization_id, public.local_date(now()), public.current_profile_id())
    on conflict (opportunity_id) do nothing;
  else
    if exists (select 1 from public.commissions where opportunity_id = o.id and status = 'paid') then
      raise exception 'Ya hay comisiones pagadas de esta oportunidad; no se puede quitar el pago del cliente.' using errcode = 'EB001';
    end if;
    delete from public.opportunity_collections where opportunity_id = o.id;
  end if;
end $$;
revoke execute on function public.mark_opportunity_collected(uuid, boolean) from public, anon;
grant execute on function public.mark_opportunity_collected(uuid, boolean) to authenticated;

-- ============ Generación al ganar (reemplaza la de 20261127) ============
create or replace function public.opportunity_commissions()
returns trigger language plpgsql security definer set search_path = '' as $$
declare s public.commission_settings := public.org_commission_settings(new.organization_id);
begin
  if new.status = 'won' and old.status <> 'won' and new.owner_id is not null then
    with parts as (
      select new.owner_id as profile_id,
             100 - coalesce((select sum(share_pct) from public.opportunity_splits where opportunity_id = new.id), 0) as share
      union all
      select profile_id, share_pct from public.opportunity_splits where opportunity_id = new.id
    )
    insert into public.commissions (organization_id, opportunity_id, opportunity_item_id, profile_id, product_id,
                                    basis, rate_pct, base_amount, share_pct, amount, currency_code, kind)
    select new.organization_id, new.id, i.id, p.profile_id, i.product_id, r.basis, r.rate_pct, b.base, p.share,
           round(b.base * p.share / 100 * r.rate_pct / 100, 2), new.currency_code, 'sale'
    from public.opportunity_items i
    cross join parts p
    join public.commission_rates r on r.profile_id = p.profile_id and r.product_id = i.product_id
    cross join lateral (select greatest(case r.basis when 'sale' then i.line_total else i.line_total - i.line_cost end, 0) as base) b
    where i.opportunity_id = new.id and p.share > 0
    on conflict (opportunity_item_id, profile_id) do nothing;

    if s.new_institution_bonus > 0 and not exists (
      select 1 from public.opportunities o where o.institution_id = new.institution_id and o.status = 'won' and o.id <> new.id
    ) then
      insert into public.commissions (organization_id, opportunity_id, profile_id, amount, currency_code, kind)
      values (new.organization_id, new.id, new.owner_id, s.new_institution_bonus, s.bonus_currency, 'new_institution')
      on conflict do nothing;
    end if;
  elsif old.status = 'won' and new.status <> 'won' then
    if exists (select 1 from public.commissions where opportunity_id = new.id and status in ('approved', 'paid')) then
      raise exception 'La oportunidad tiene comisiones aprobadas o pagadas; no puede reabrirse.' using errcode = 'EB001';
    end if;
    delete from public.commissions where opportunity_id = new.id and status in ('pending', 'rejected');
    delete from public.opportunity_collections where opportunity_id = new.id;
  end if;
  return new;
end;
$$;

-- ============ Escalones por meta ============
create or replace function public.close_goal_tier(p_goal uuid)
returns numeric language plpgsql security definer set search_path = '' as $$
declare
  g public.goals;
  s public.commission_settings;
  actual numeric;
  pct numeric;
  extra numeric;
begin
  if not public.has_permission('commissions.approve') then
    raise exception 'No tienes permiso para calcular escalones.' using errcode = 'EB001';
  end if;
  select * into g from public.goals where id = p_goal and organization_id = public.current_org_id();
  if g.id is null then
    raise exception 'Meta no encontrada.' using errcode = 'EB001';
  end if;
  if g.owner_id is null or g.metric not in ('revenue', 'margin') then
    raise exception 'Los escalones aplican a metas de venta o margen asignadas a un agente.' using errcode = 'EB001';
  end if;
  if g.period_end >= public.local_date(now()) then
    raise exception 'La meta aún no termina; calcula el escalón después del %.', g.period_end using errcode = 'EB001';
  end if;
  if exists (select 1 from public.commissions where goal_id = g.id) then
    raise exception 'El escalón de esta meta ya se calculó.' using errcode = 'EB001';
  end if;
  -- goals_progress filtra por el responsable (que pertenece a una sola organización).
  select gp.actual into actual from public.goals_progress() gp where gp.id = g.id;
  pct := coalesce(actual, 0) / g.target * 100;
  s := public.org_commission_settings(g.organization_id);
  select max((t->>'extra_pct')::numeric) into extra
  from jsonb_array_elements(s.tiers) t where (t->>'min_pct')::numeric <= pct;
  if extra is null or extra <= 0 then
    raise exception 'La meta llegó al % %% y no alcanzó ningún escalón.', round(pct, 1) using errcode = 'EB001';
  end if;
  insert into public.commissions (organization_id, profile_id, goal_id, basis, rate_pct, base_amount, amount, currency_code, kind)
  values (g.organization_id, g.owner_id, g.id, case g.metric when 'revenue' then 'sale' else 'margin' end,
          extra, actual, round(actual * extra / 100, 2), g.currency_code, 'tier');
  return round(actual * extra / 100, 2);
end $$;
revoke execute on function public.close_goal_tier(uuid) from public, anon;
grant execute on function public.close_goal_tier(uuid) to authenticated;

-- ============ Aprobación: pagar exige cobranza cuando está activada ============
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
  if p_status = 'paid' and c.opportunity_id is not null and (public.org_commission_settings(c.organization_id)).require_collection
     and not exists (select 1 from public.opportunity_collections where opportunity_id = c.opportunity_id) then
    raise exception 'El cliente aún no paga esta oportunidad; registra el pago antes de pagar la comisión.' using errcode = 'EB001';
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
