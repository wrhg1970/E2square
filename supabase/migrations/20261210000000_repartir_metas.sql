-- Repartir una meta general (sin vendedor) entre vendedores. Reglas propuestas:
--   * Cada vendedor recibe una meta hija con el mismo indicador, periodo, moneda y alcance, ligada por parent_id.
--   * En partes iguales (sin montos) o con montos por vendedor que sumen exactamente el objetivo general.
--   * Volver a repartir reemplaza el reparto anterior; borrar la general borra su reparto.
alter table public.goals
  add column parent_id uuid,
  add foreign key (parent_id, organization_id) references public.goals(id, organization_id) on delete cascade;
create index goals_parent_idx on public.goals (parent_id);

create or replace function public.split_goal(p_goal uuid, p_owners uuid[], p_targets numeric[] default null)
returns int language plpgsql security invoker set search_path = '' as $$
declare
  g public.goals;
  n int := coalesce(cardinality(p_owners), 0);
  whole boolean;
  base numeric;
  rest numeric;
begin
  if not public.has_permission('goals.manage') then
    raise exception 'No tienes permiso para administrar metas.' using errcode = 'EB001';
  end if;
  select * into g from public.goals where id = p_goal and organization_id = public.current_org_id();
  if g.id is null then
    raise exception 'Meta no encontrada.' using errcode = 'EB001';
  end if;
  if g.owner_id is not null or g.parent_id is not null then
    raise exception 'Solo se reparte una meta general (sin vendedor).' using errcode = 'EB001';
  end if;
  if n < 2 or n <> cardinality(array(select distinct unnest(p_owners))) then
    raise exception 'Elige al menos dos vendedores distintos.' using errcode = 'EB001';
  end if;
  if (select count(*) from public.profiles where id = any(p_owners) and organization_id = g.organization_id and status = 'active') <> n then
    raise exception 'Algún vendedor no existe o está inactivo.' using errcode = 'EB001';
  end if;
  whole := g.metric not in ('revenue', 'margin');
  if p_targets is null then
    -- Partes iguales; el residuo de redondeo se reparte entre los primeros.
    base := case when whole then floor(g.target / n) else floor(g.target / n * 100) / 100 end;
    rest := g.target - base * n;
    p_targets := array(select base + case when whole then (case when i <= rest then 1 else 0 end)
                                          else (case when i = 1 then rest else 0 end) end
                       from generate_series(1, n) i);
  elsif cardinality(p_targets) <> n or exists (select 1 from unnest(p_targets) t where t is null or t <= 0) then
    raise exception 'Cada vendedor necesita un objetivo mayor que cero.' using errcode = 'EB001';
  elsif (select sum(t) from unnest(p_targets) t) <> g.target then
    raise exception 'Los objetivos suman %, pero la meta general es %.', (select sum(t) from unnest(p_targets) t), g.target
      using errcode = 'EB001';
  end if;
  if exists (select 1 from unnest(p_targets) t where t <= 0) then
    raise exception 'El objetivo es muy pequeño para repartirlo entre % vendedores.', n using errcode = 'EB001';
  end if;

  delete from public.goals where parent_id = g.id;
  insert into public.goals (organization_id, name, metric, period_start, period_end, target, currency_code, owner_id,
                            office_id, product_id, company_id, business_unit_id, created_by, parent_id)
  select g.organization_id, left(g.name || ' · ' || coalesce(nullif(p.full_name, ''), p.email), 200), g.metric, g.period_start,
         g.period_end, x.t, g.currency_code, x.o, g.office_id, g.product_id, g.company_id, g.business_unit_id,
         public.current_profile_id(), g.id
  from unnest(p_owners, p_targets) x(o, t) join public.profiles p on p.id = x.o;
  return n;
end $$;
revoke execute on function public.split_goal(uuid, uuid[], numeric[]) from public, anon;
grant execute on function public.split_goal(uuid, uuid[], numeric[]) to authenticated;
