-- Proveedores con varios productos.
begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

select public.bootstrap_organization('Org A', 'org-a', 'admin-a@test.dev');
insert into auth.users (id, email) values ('00000000-0000-0000-0000-00000000000a', 'admin-a@test.dev');
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', true);

select is((select count(*)::int from public.products where supplier_id is null and default_pipeline_id is not null), 7,
  'los productos de siempre son proveedores con su pipeline');

insert into public.products (organization_id, code, name, supplier_id)
select public.current_org_id(), 'TOEFL-ITP', 'TOEFL ITP', id from public.products where code = 'TOEFL';
select is((select s.code from public.products p join public.products s on s.id = p.supplier_id where p.code = 'TOEFL-ITP'), 'TOEFL',
  'un producto cuelga de su proveedor');

select throws_ok($$ insert into public.products (organization_id, code, name, supplier_id)
  select public.current_org_id(), 'NIETO', 'Nieto', id from public.products where code = 'TOEFL-ITP' $$,
  'EB001', null, 'un producto no puede ser proveedor de otro');
select throws_ok($$ update public.products set supplier_id = (select id from public.products where code = 'IHS') where code = 'TOEFL' $$,
  'EB001', null, 'un proveedor con productos no se mete dentro de otro');
select throws_ok($$ update public.products set default_pipeline_id = (select default_pipeline_id from public.products where code = 'IHS') where code = 'TOEFL-ITP' $$,
  '23514', null, 'el pipeline es del proveedor, no del producto');

insert into public.institutions (organization_id, name, institution_type, country_code, owner_id, created_by)
values (public.current_org_id(), 'Colegio Prov', 'school', 'MX', public.current_profile_id(), public.current_profile_id());
insert into public.opportunities (organization_id, institution_id, pipeline_id, stage_id, name, owner_id, currency_code, probability, created_by)
select public.current_org_id(), i.id, s.default_pipeline_id,
  (select id from public.pipeline_stages where pipeline_id = s.default_pipeline_id order by sort_order limit 1),
  'TOEFL 2027', public.current_profile_id(), 'USD', 0, public.current_profile_id()
from public.institutions i, public.products s where i.name = 'Colegio Prov' and s.code = 'TOEFL';

select lives_ok($$ insert into public.opportunity_items (organization_id, opportunity_id, product_id, quantity, unit_price)
  select public.current_org_id(), o.id, p.id, 10, 20 from public.opportunities o, public.products p where p.code = 'TOEFL-ITP' $$,
  'la oportunidad acepta productos de su proveedor');
select throws_ok($$ insert into public.opportunity_items (organization_id, opportunity_id, product_id, quantity, unit_price)
  select public.current_org_id(), o.id, p.id, 1, 1 from public.opportunities o, public.products p where p.code = 'IHS' $$,
  'EB001', null, 'y rechaza productos de otro proveedor');

select * from finish();
rollback;
