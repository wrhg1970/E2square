-- Consultas a los datos (Fase 8): un menú fijo de indicadores y agrupaciones, nunca SQL libre.
-- La IA solo traduce la pregunta a estos parámetros. Corre con los permisos de quien consulta (RLS).
create or replace function public.query_metric(p_metric text, p_group text, p_from date, p_to date)
returns table (label text, value numeric, unconverted bigint)
language plpgsql stable security invoker set search_path = '' as $$
begin
  if p_metric not in ('won_amount', 'won_margin', 'won_units', 'won_count', 'lost_count', 'open_amount') then
    raise exception 'Indicador no válido.' using errcode = 'EB001';
  end if;
  if p_group not in ('total', 'month', 'supplier', 'owner', 'stage', 'company') then
    raise exception 'Agrupación no válida.' using errcode = 'EB001';
  end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 3660 then
    raise exception 'Rango de fechas no válido (máximo 10 años).' using errcode = 'EB001';
  end if;
  return query
  with cur as (select o.reporting_currency::text as c from public.organizations o where o.id = public.current_org_id()),
  f as (
    select x.*, d.day,
      case p_group
        when 'month' then to_char(d.day, 'YYYY-MM')
        when 'supplier' then coalesce(p.name, 'Sin proveedor')
        when 'owner' then coalesce(nullif(pr.full_name, ''), pr.email, 'Sin responsable')
        when 'stage' then coalesce(s.name, 'Sin etapa')
        when 'company' then coalesce(c.legal_name, 'Sin empresa')
        else 'Total'
      end as grp
    from public.opportunity_facts x
    cross join lateral (select case when p_metric = 'open_amount' then x.expected_close_date else public.local_date(x.closed_at) end as day) d
    left join public.products p on p.id = x.product_id
    left join public.profiles pr on pr.id = x.owner_id
    left join public.pipeline_stages s on s.id = x.stage_id
    left join public.companies c on c.id = x.company_id
    where x.status = case p_metric when 'open_amount' then 'open' when 'lost_count' then 'lost' else 'won' end
      and d.day between p_from and p_to
  ),
  v as (
    select f.grp,
      case p_metric
        when 'won_amount' then public.convert_amount(f.amount, f.currency_code, cur.c, f.day)
        when 'open_amount' then public.convert_amount(f.amount, f.currency_code, cur.c, least(f.day, current_date))
        when 'won_margin' then public.convert_amount(f.margin, f.currency_code, cur.c, f.day)
        when 'won_units' then f.units
        else 1
      end as val
    from f, cur
  )
  select v.grp, coalesce(sum(v.val), 0), count(*) filter (where v.val is null)
  from v group by v.grp
  order by case when p_group = 'month' then v.grp end, sum(v.val) desc nulls last, v.grp
  limit 100;
end $$;
revoke execute on function public.query_metric(text, text, date, date) from public, anon;
grant execute on function public.query_metric(text, text, date, date) to authenticated;
