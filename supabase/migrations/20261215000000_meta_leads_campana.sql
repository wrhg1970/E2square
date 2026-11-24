-- Meta de leads por campaña (opcional). Regla propuesta (pendiente de confirmar por Will):
--   * Un lead es una institución distinta que abrió al menos una oportunidad marcada con la campaña
--     (source_campaign_id). Varias oportunidades de la misma institución cuentan como un lead.
alter table public.campaigns add column lead_goal integer check (lead_goal is null or lead_goal between 1 and 1000000);

create or replace function public.campaign_results(p_campaign uuid)
returns jsonb language sql stable security invoker set search_path = '' as $$
  with camp as (select * from public.campaigns where id = p_campaign),
  m as (select cm.* from public.campaign_members cm, camp where cm.campaign_id = camp.id),
  since as (select coalesce(launched_at, start_date::timestamptz) as t from camp),
  o as (
    select op.status, op.closed_at, op.institution_id,
      public.convert_amount(op.amount, op.currency_code, camp.currency_code, coalesce(public.local_date(op.closed_at), current_date)) as amount_c,
      public.convert_amount(op.margin, op.currency_code, camp.currency_code, coalesce(public.local_date(op.closed_at), current_date)) as margin_c
    from public.opportunities op, camp where op.source_campaign_id = camp.id
  ),
  won as (select coalesce(sum(margin_c), 0) as margin, coalesce(sum(amount_c), 0) as amount, count(*) as n from o where status = 'won')
  select jsonb_build_object(
    'members', (select count(*) from m),
    'with_consent', (select count(*) from m where consent_basis = 'granted'),
    'responded', (select count(distinct c.institution_id) from public.communications c, since
                  where c.institution_id in (select institution_id from m) and c.direction = 'inbound' and c.sent_at >= since.t),
    'meetings', (select count(*) from public.activities a, since
                 where a.institution_id in (select institution_id from m) and a.status = 'done'
                   and a.activity_type in ('meeting', 'visit', 'video_call', 'presentation') and a.completed_at >= since.t),
    'tasks_pending', (select count(*) from public.activities a, camp
                      where a.status = 'pending' and (a.campaign_id = camp.id or (a.campaign_id is null and a.institution_id in (select institution_id from m) and a.subject = left('Campaña: ' || camp.name, 200)))),
    'opportunities', (select count(*) from o),
    'leads', (select count(distinct institution_id) from o),
    'lead_goal', (select lead_goal from camp),
    'open_amount', coalesce((select sum(amount_c) from o where status = 'open'), 0),
    'won_count', (select n from won),
    'won_amount', (select amount from won),
    'won_margin', (select margin from won),
    'unconverted', (select count(*) from o where amount_c is null),
    'cost', (select actual_cost from camp),
    'roi_pct', (select case when camp.actual_cost > 0 then round(((won.margin - camp.actual_cost) / camp.actual_cost) * 100, 1) end from camp, won)
  )
$$;
