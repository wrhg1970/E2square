-- Importación de oportunidades históricas (ventas ganadas, perdidas o abiertas) desde Excel.
--   * Solo con permiso import.run y sobre instituciones que quien importa puede ver.
--   * Una línea por oportunidad (proveedor o producto, monto y costo). Las ganadas y perdidas quedan con su fecha real de cierre.
--   * No genera comisiones ni tareas automáticas: es historia, no ventas nuevas. Quedan marcadas con imported_at.

alter table public.opportunities add column imported_at timestamptz;

-- Durante la importación (bandera local a la transacción) se saltan comisiones y automatizaciones.
create or replace function public.run_opportunity_automations()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  rule_key text;
  subj text;
  kind text;
  r public.automation_rules;
begin
  if new.owner_id is null or current_setting('e2.importing', true) = 'on' then return new; end if;
  if tg_op = 'INSERT' then
    rule_key := 'first_contact'; subj := 'Primer contacto: ' || new.name; kind := 'call';
  elsif new.status = 'won' and old.status <> 'won' then
    rule_key := 'won_handoff'; subj := 'Entrega a operación: ' || new.name; kind := 'internal_task';
  elsif new.owner_id is distinct from old.owner_id then
    rule_key := 'owner_change'; subj := 'Revisar oportunidad reasignada: ' || new.name; kind := 'follow_up';
  else
    return new;
  end if;

  select * into r from public.automation_rules where organization_id = new.organization_id and key = rule_key and enabled;
  if r.id is null then return new; end if;
  -- Idempotente: una tarea pendiente por regla, oportunidad y responsable.
  if exists (select 1 from public.activities where opportunity_id = new.id and automation_key = rule_key
             and owner_id = new.owner_id and status = 'pending') then
    return new;
  end if;

  insert into public.activities (organization_id, activity_type, subject, opportunity_id, owner_id, due_at, timezone, automation_key)
  select new.organization_id, kind, left(subj, 200), new.id, new.owner_id, now() + make_interval(days => r.days), p.timezone, rule_key
  from public.profiles p where p.id = new.owner_id;
  return new;
end;
$$;

create or replace function public.opportunity_commissions()
returns trigger language plpgsql security definer set search_path = '' as $$
declare s public.commission_settings := public.org_commission_settings(new.organization_id);
begin
  if current_setting('e2.importing', true) = 'on' then return new; end if;
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


create or replace function public.import_opportunity(
  p_institution uuid, p_supplier uuid, p_product uuid, p_name text, p_owner uuid, p_currency text,
  p_amount numeric, p_cost numeric, p_status text, p_close_date date, p_loss_reason text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  org uuid := public.current_org_id();
  me uuid := public.current_profile_id();
  sup public.products;
  inst public.institutions;
  prod uuid := coalesce(p_product, p_supplier);
  first_stage uuid;
  final_stage uuid;
  contact uuid;
  o uuid;
begin
  if not public.has_permission('import.run') then
    raise exception 'No tienes permiso para importar.' using errcode = 'EB001';
  end if;
  select * into inst from public.institutions where id = p_institution and organization_id = org;
  if inst.id is null or not public.can_see_institution_id(p_institution) then
    raise exception 'Institución no encontrada.' using errcode = 'EB001';
  end if;
  select * into sup from public.products
  where id = p_supplier and organization_id = org and supplier_id is null and default_pipeline_id is not null;
  if sup.id is null then
    raise exception 'Proveedor no encontrado.' using errcode = 'EB001';
  end if;
  if prod <> p_supplier and not exists (select 1 from public.products where id = prod and supplier_id = p_supplier) then
    raise exception 'El producto no es de ese proveedor.' using errcode = 'EB001';
  end if;
  if p_owner is not null and not exists (select 1 from public.profiles where id = p_owner and organization_id = org) then
    raise exception 'Responsable no encontrado.' using errcode = 'EB001';
  end if;
  if p_status not in ('open', 'won', 'lost') then
    raise exception 'Estado no válido.' using errcode = 'EB001';
  end if;
  if p_amount is null or p_amount < 0 or coalesce(p_cost, 0) < 0 then
    raise exception 'Monto o costo no válido.' using errcode = 'EB001';
  end if;
  if p_status <> 'open' and p_close_date is null then
    raise exception 'Falta la fecha de cierre.' using errcode = 'EB001';
  end if;

  select id into first_stage from public.pipeline_stages
  where pipeline_id = sup.default_pipeline_id and not is_won and not is_lost order by sort_order limit 1;
  select contact_id into contact from public.institution_contacts where institution_id = p_institution and is_primary limit 1;

  perform set_config('e2.importing', 'on', true);
  insert into public.opportunities (organization_id, company_id, business_unit_id, institution_id, pipeline_id, stage_id, name,
                                    owner_id, currency_code, expected_close_date, primary_contact_id, created_by, imported_at)
  values (org, inst.company_id, inst.business_unit_id, p_institution, sup.default_pipeline_id, first_stage,
          left(coalesce(nullif(trim(p_name), ''), sup.name || ' · ' || inst.name), 200),
          coalesce(p_owner, me), p_currency, p_close_date, contact, me, now())
  returning id into o;
  if p_amount > 0 then
    insert into public.opportunity_items (organization_id, opportunity_id, product_id, quantity, unit_price, unit_cost)
    values (org, o, prod, 1, p_amount, coalesce(p_cost, 0));
  end if;
  if p_status <> 'open' then
    select id into final_stage from public.pipeline_stages
    where pipeline_id = sup.default_pipeline_id and (case when p_status = 'won' then is_won else is_lost end)
    order by sort_order limit 1;
    update public.opportunities
    set stage_id = final_stage,
        loss_reason = case when p_status = 'lost' then coalesce(nullif(trim(p_loss_reason), ''), 'Sin motivo registrado') end
    where id = o;
    -- Fecha real de cierre (mediodía en Ciudad de México para no cambiar de día).
    update public.opportunities set closed_at = (p_close_date + time '12:00') at time zone 'America/Mexico_City' where id = o;
  end if;
  perform set_config('e2.importing', 'off', true);
  return o;
end $$;
revoke execute on function public.import_opportunity(uuid, uuid, uuid, text, uuid, text, numeric, numeric, text, date, text) from public, anon;
grant execute on function public.import_opportunity(uuid, uuid, uuid, text, uuid, text, numeric, numeric, text, date, text) to authenticated;

alter table public.import_runs drop constraint import_runs_entity_check;
alter table public.import_runs add constraint import_runs_entity_check check (entity in ('institutions', 'opportunities'));
