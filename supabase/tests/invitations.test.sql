-- Usuario creado en Auth ANTES de su invitación o del bootstrap.
begin;
create extension if not exists pgtap with schema extensions;
select plan(3);

insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000b1', 'Primero@Test.dev');
select is((select count(*)::int from public.profiles where email = 'primero@test.dev'), 0, 'sin invitación no hay perfil');

select public.bootstrap_organization('Org Tardía', 'org-tardia', 'primero@test.dev');
select is((select r.key from public.profiles p join public.profile_roles pr on pr.profile_id = p.id join public.roles r on r.id = pr.role_id
           where p.email = 'primero@test.dev'), 'admin', 'el bootstrap liga como admin a un usuario que ya existía');
select ok((select accepted_at is not null from public.invitations where email = 'primero@test.dev'), 'la invitación queda aceptada');

select * from finish();
rollback;
