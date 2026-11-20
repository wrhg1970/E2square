-- Fase 8b: puntaje explicable de instituciones (AI_SPEC.md › Scoring).
-- Reglas transparentes, sin atributos sensibles. Se calcula al consultarlo (SECURITY INVOKER: solo con datos que el usuario ve).

alter table public.organizations add column score_weights jsonb not null default
  '{"fit": 20, "need": 15, "engagement": 15, "decision_access": 15, "budget": 10, "urgency": 10, "recency": 15}';

create or replace function public.institution_scores(p_ids uuid[])
returns table (institution_id uuid, score int, factors jsonb, computed_at timestamptz)
language sql stable security invoker set search_path = '' as $$
  with w as (
    select coalesce((select score_weights from public.organizations where id = public.current_org_id()), '{}'::jsonb) as j
  ), raw as (
    select i.id,
      jsonb_build_array(
        jsonb_build_object('key', 'fit', 'label', 'Ajuste institucional',
          'value', case i.potential when 'high' then 1 when 'medium' then 0.6 when 'low' then 0.2 else 0 end,
          'detail', case i.potential when 'high' then 'Potencial alto' when 'medium' then 'Potencial medio' when 'low' then 'Potencial bajo' else 'Sin potencial capturado' end),
        jsonb_build_object('key', 'need', 'label', 'Necesidad',
          'value', case when o.open_count > 0 then 1 else 0 end,
          'detail', o.open_count || ' oportunidad(es) abierta(s)'),
        jsonb_build_object('key', 'engagement', 'label', 'Interacción',
          'value', least(a.done_90 / 5.0, 1),
          'detail', a.done_90 || ' actividad(es) realizada(s) en 90 días'),
        jsonb_build_object('key', 'decision_access', 'label', 'Acceso a decisores',
          'value', case when c.decision_makers > 0 then 1 when c.buyers > 0 then 0.5 else 0 end,
          'detail', case when c.decision_makers > 0 then 'Hay contacto decisor'
                         when c.buyers > 0 then 'Contacto de compras o finanzas, sin decisor' else 'Sin contacto decisor' end),
        jsonb_build_object('key', 'budget', 'label', 'Presupuesto',
          'value', case when o.with_amount > 0 then 1 else 0 end,
          'detail', case when o.with_amount > 0 then 'Oportunidad abierta con monto cotizado' else 'Sin monto cotizado' end),
        jsonb_build_object('key', 'urgency', 'label', 'Urgencia',
          'value', case when o.next_close <= current_date + 60 then 1 when o.next_close <= current_date + 120 then 0.5 else 0 end,
          'detail', coalesce('Cierre estimado ' || to_char(o.next_close, 'YYYY-MM-DD'), 'Sin fecha de cierre')),
        jsonb_build_object('key', 'recency', 'label', 'Actividad reciente',
          'value', case when i.last_activity_at > now() - interval '14 days' then 1
                        when i.last_activity_at > now() - interval '30 days' then 0.6
                        when i.last_activity_at > now() - interval '90 days' then 0.3 else 0 end,
          'detail', coalesce('Última interacción ' || to_char(i.last_activity_at, 'YYYY-MM-DD'), 'Sin interacciones'))
      ) as f
    from public.institutions i
    cross join lateral (
      select count(*) filter (where status = 'open') as open_count,
             count(*) filter (where status = 'open' and amount > 0) as with_amount,
             min(expected_close_date) filter (where status = 'open' and expected_close_date >= current_date) as next_close
      from public.opportunities where opportunities.institution_id = i.id) o
    cross join lateral (
      select count(*) as done_90 from public.activities
      where activities.institution_id = i.id and status = 'done' and completed_at > now() - interval '90 days') a
    cross join lateral (
      select count(*) filter (where decision_role = 'decision_maker') as decision_makers,
             count(*) filter (where decision_role in ('buyer', 'finance')) as buyers
      from public.institution_contacts where institution_contacts.institution_id = i.id) c
    where i.id = any(p_ids)
  )
  select r.id,
    round(100 * sum((x->>'value')::numeric * coalesce((w.j->>(x->>'key'))::numeric, 0))
          / nullif(sum(coalesce((w.j->>(x->>'key'))::numeric, 0)), 0))::int,
    jsonb_agg(x || jsonb_build_object('weight', coalesce((w.j->>(x->>'key'))::numeric, 0))),
    now()
  from raw r cross join w cross join lateral jsonb_array_elements(r.f) x
  group by r.id;
$$;
