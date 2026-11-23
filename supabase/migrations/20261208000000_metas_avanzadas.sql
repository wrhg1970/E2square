-- Metas avanzadas: alcance por empresa y unidad de negocio (además de vendedor, oficina y proveedor).
-- Venta, margen y unidades usan la empresa/unidad de la oportunidad; instituciones nuevas y actividades, la de la institución.

alter table public.goals
  add column company_id uuid,
  add column business_unit_id uuid,
  add foreign key (company_id, organization_id) references public.companies(id, organization_id),
  add foreign key (business_unit_id, organization_id) references public.business_units(id, organization_id);

-- Columnas nuevas al final (create or replace view no permite reordenar).
create or replace view public.opportunity_facts with (security_invoker = true) as
select o.id, o.organization_id, o.name, o.institution_id, o.owner_id, o.status, o.currency_code, o.amount, o.cost, o.margin, o.probability,
       o.expected_close_date, o.closed_at, o.created_at, o.stage_id, o.pipeline_id, o.stage_entered_at,
       p.id as product_id, i.office_id,
       (select coalesce(sum(quantity), 0) from public.opportunity_items it where it.opportunity_id = o.id) as units,
       o.company_id, o.business_unit_id
from public.opportunities o
join public.institutions i on i.id = o.institution_id
left join public.products p on p.default_pipeline_id = o.pipeline_id;

drop function public.goals_progress();
create function public.goals_progress()
returns table (id uuid, name text, metric text, period_start date, period_end date, target numeric, currency_code text,
               owner_id uuid, office_id uuid, product_id uuid, actual numeric, unconverted bigint,
               company_id uuid, business_unit_id uuid)
language sql stable security invoker set search_path = '' as $$
  select g.id, g.name, g.metric, g.period_start, g.period_end, g.target, g.currency_code, g.owner_id, g.office_id, g.product_id,
    case g.metric
      when 'revenue' then w.revenue
      when 'margin' then w.margin
      when 'units' then w.units
      when 'new_institutions' then (select count(*) from public.institutions i
        where public.local_date(i.created_at) between g.period_start and g.period_end
          and (g.owner_id is null or i.owner_id = g.owner_id) and (g.office_id is null or i.office_id = g.office_id)
          and (g.company_id is null or i.company_id = g.company_id)
          and (g.business_unit_id is null or i.business_unit_id = g.business_unit_id))
      when 'activities' then (select count(*) from public.activities a
        left join public.institutions i on i.id = a.institution_id
        where a.status = 'done' and public.local_date(a.completed_at) between g.period_start and g.period_end
          and (g.owner_id is null or a.owner_id = g.owner_id)
          and (g.office_id is null or i.office_id = g.office_id)
          and (g.company_id is null or i.company_id = g.company_id)
          and (g.business_unit_id is null or i.business_unit_id = g.business_unit_id))
    end,
    case when g.metric in ('revenue', 'margin') then w.unconverted else 0 end,
    g.company_id, g.business_unit_id
  from public.goals g
  cross join lateral (
    select coalesce(sum(c.amount_g), 0) as revenue, coalesce(sum(c.margin_g), 0) as margin, coalesce(sum(c.units), 0) as units,
           count(*) filter (where c.amount_g is null) as unconverted
    from (
      select f.units,
        public.convert_amount(f.amount, f.currency_code, g.currency_code, public.local_date(f.closed_at)) as amount_g,
        public.convert_amount(f.margin, f.currency_code, g.currency_code, public.local_date(f.closed_at)) as margin_g
      from public.opportunity_facts f
      where f.status = 'won' and public.local_date(f.closed_at) between g.period_start and g.period_end
        and (g.owner_id is null or f.owner_id = g.owner_id)
        and (g.office_id is null or f.office_id = g.office_id)
        and (g.product_id is null or f.product_id = g.product_id)
        and (g.company_id is null or f.company_id = g.company_id)
        and (g.business_unit_id is null or f.business_unit_id = g.business_unit_id)
    ) c
  ) w
  order by g.period_start desc, g.name
$$;
grant execute on function public.goals_progress() to authenticated;
