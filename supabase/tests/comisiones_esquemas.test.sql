-- Esquemas de comisión: reparto, bono por institución nueva, cobranza y escalones por meta.
begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

select public.bootstrap_organization('Org A', 'org-a', 'admin-a@test.dev');
insert into public.invitations (organization_id, email, role_id)
select o.id, x.email, r.id from public.organizations o
join (values ('rep1@test.dev', 'sales_rep'), ('rep2@test.dev', 'sales_rep'), ('dir@test.dev', 'sales_director')) x(email, role_key) on true
join public.roles r on r.organization_id = o.id and r.key = x.role_key
where o.slug = 'org-a';
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'admin-a@test.dev'),
  ('00000000-0000-0000-0000-000000000001', 'rep1@test.dev'),
  ('00000000-0000-0000-0000-000000000002', 'rep2@test.dev'),
  ('00000000-0000-0000-0000-00000000000d', 'dir@test.dev');

-- Las líneas de una oportunidad son productos de su proveedor (TOEFL): EVAL e IHS se simulan como productos de TOEFL.
insert into public.products (organization_id, code, name, supplier_id)
select p.organization_id, x.c, x.n, p.id from public.products p, (values ('EVAL-T', 'Evaluación TOEFL'), ('IHS-T', 'IHS TOEFL')) x(c, n)
where p.code = 'TOEFL';

create temp table ids as
select o.id as org,
  (select id from public.profiles where email = 'rep1@test.dev') as rep1,
  (select id from public.profiles where email = 'rep2@test.dev') as rep2,
  (select id from public.profiles where email = 'dir@test.dev') as dir,
  (select id from public.products where organization_id = o.id and code = 'TOEFL') as toefl,
  (select id from public.products where organization_id = o.id and code = 'EVAL-T') as eval,
  (select id from public.products where organization_id = o.id and code = 'IHS-T') as ihs,
  (select default_pipeline_id from public.products where organization_id = o.id and code = 'TOEFL') as pipeline
from public.organizations o where o.slug = 'org-a';
alter table ids add column neg uuid, add column won uuid;
update ids set neg = (select id from public.pipeline_stages where pipeline_id = ids.pipeline and name = 'Negociación'),
               won = (select id from public.pipeline_stages where pipeline_id = ids.pipeline and name = 'Ganada');
grant select on ids to authenticated;

-- Crea una oportunidad ganable del dueño actual con líneas TOEFL, EVAL e IHS.
create function pg_temp.new_opp(p_name text, p_inst uuid default null) returns uuid language plpgsql as $$
declare oid uuid; inst uuid := p_inst;
begin
  if inst is null then
    insert into public.institutions (organization_id, name, institution_type, country_code, owner_id, created_by)
    values (public.current_org_id(), 'Colegio ' || p_name, 'school', 'MX', public.current_profile_id(), public.current_profile_id()) returning id into inst;
  end if;
  insert into public.opportunities (organization_id, institution_id, pipeline_id, stage_id, name, owner_id, currency_code, probability, created_by, expected_close_date)
  select public.current_org_id(), inst, pipeline, (select id from public.pipeline_stages where pipeline_id = ids.pipeline and name = 'Lead'),
         p_name, public.current_profile_id(), 'MXN', 0, public.current_profile_id(), '2027-01-31' from ids returning id into oid;
  insert into public.opportunity_items (organization_id, opportunity_id, product_id, quantity, unit_price, discount_pct, unit_cost)
  select public.current_org_id(), oid, x.p, x.q, x.price, x.disc, x.cost from ids,
  lateral (values (ids.toefl, 30, 150, 10, 60), (ids.eval, 2, 1000, 0, 400), (ids.ihs, 1, 500, 0, 0)) x(p, q, price, disc, cost);
  return oid;
end $$;
grant execute on function pg_temp.new_opp(text, uuid) to authenticated;


set local role authenticated;

-- Director: porcentajes, bono de 500 MXN por institución nueva y escalones (100% = +1%, 120% = +2%).
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000d', true);
insert into public.commission_rates (organization_id, profile_id, product_id, rate_pct, basis)
select org, rep1, toefl, 10, 'sale' from ids union all select org, rep2, toefl, 10, 'sale' from ids;
insert into public.commission_settings (organization_id, new_institution_bonus, bonus_currency, tiers)
select org, 500, 'MXN', '[{"min_pct": 100, "extra_pct": 1}, {"min_pct": 120, "extra_pct": 2}]' from ids;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);
update public.commission_settings set new_institution_bonus = 99999;
select is((select new_institution_bonus from public.commission_settings), 500.00, 'el vendedor no puede subir el bono');
create temp table opp1 as select pg_temp.new_opp('Reparto') as id;
grant select on opp1 to authenticated;
select lives_ok($$ insert into public.opportunity_splits (organization_id, opportunity_id, profile_id, share_pct)
  select org, (select id from opp1), rep2, 30 from ids $$, 'el responsable cede 30% a otro agente');
select throws_ok($$ insert into public.opportunity_splits (organization_id, opportunity_id, profile_id, share_pct)
  select org, (select id from opp1), dir, 70 from ids $$, 'EB001', null, 'el reparto no puede dejar al responsable sin nada');
select throws_ok($$ insert into public.opportunity_splits (organization_id, opportunity_id, profile_id, share_pct)
  select org, (select id from opp1), rep1, 10 from ids $$, 'EB001', null, 'el responsable no se agrega a sí mismo');
update public.opportunities set stage_id = (select won from ids) where id = (select id from opp1);

reset role;
select is((select string_agg(p.email || ':' || c.share_pct || ':' || c.amount, ', ' order by p.email)
  from public.commissions c join public.profiles p on p.id = c.profile_id where c.kind = 'sale'),
  'rep1@test.dev:70.00:283.5000, rep2@test.dev:30.00:121.5000',
  'al ganar: 4050 de TOEFL se reparte 70/30 y cada quien cobra su 10%');
select is((select (p.email, c.amount, c.currency_code)::text from public.commissions c join public.profiles p on p.id = c.profile_id where c.kind = 'new_institution'),
  '(rep1@test.dev,500.0000,MXN)', 'la primera venta de la institución paga el bono al responsable');
set local role authenticated;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);
select throws_ok($$ delete from public.opportunity_splits $$, 'EB001', null, 'no se cambia el reparto de una oportunidad ganada');
create temp table opp2 as select pg_temp.new_opp('Recompra', (select institution_id from public.opportunities where id = (select id from opp1))) as id;
update public.opportunities set stage_id = (select won from ids) where id = (select id from opp2);
select is((select count(*)::int from public.commissions where kind = 'new_institution'), 1, 'la segunda venta a la misma institución no repite el bono');
select throws_ok($$ select public.mark_opportunity_collected((select id from opp1), true) $$, 'EB001', null, 'el vendedor no registra cobranza');

-- Escalones: las dos ventas (6550 c/u = 13100) cerraron dentro de una meta de 10000 que ya terminó: 131% alcanza el escalón de 120% -> +2%.
reset role;
update public.opportunities set closed_at = now() - interval '3 days' where id in ((select id from opp1), (select id from opp2));
insert into public.goals (organization_id, name, metric, period_start, period_end, target, currency_code, owner_id)
select org, 'Venta rep1', 'revenue', current_date - 10, current_date - 1, 10000, 'MXN', rep1 from ids union all
select org, 'Venta en curso', 'revenue', current_date - 10, current_date + 10, 10000, 'MXN', rep1 from ids;
set local role authenticated;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000d', true);
select is(public.close_goal_tier((select id from public.goals where name = 'Venta rep1')), 262.00, 'meta al 131%: escalón más alto alcanzado (120%) = 2% extra sobre 13100 = 262');
select throws_ok($$ select public.close_goal_tier((select id from public.goals where name = 'Venta rep1')) $$, 'EB001',
  'El escalón de esta meta ya se calculó.', 'el escalón no se calcula dos veces');
select throws_ok($$ select public.close_goal_tier((select id from public.goals where name = 'Venta en curso')) $$, 'EB001', null,
  'no se calcula el escalón de una meta que no ha terminado');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);
select is((select count(*)::int from public.commissions where kind = 'tier'), 1, 'el agente ve su comisión de escalón');

select * from finish();
rollback;
