-- Administración de usuarios: nadie puede desactivarse a sí mismo ni quitarse el permiso de administrar usuarios
-- (así siempre queda al menos un administrador con acceso).
create or replace function public.guard_self_lockout_profile()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.id = public.current_profile_id() and new.status <> 'active' then
    raise exception 'No puedes desactivar tu propio usuario.' using errcode = 'EB001';
  end if;
  return new;
end;
$$;
create trigger profiles_guard_self_lockout before update of status on public.profiles
for each row execute function public.guard_self_lockout_profile();

create or replace function public.guard_self_lockout_role()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.profile_id = public.current_profile_id() and not exists (
    select 1 from public.profile_roles pr join public.role_permissions rp on rp.role_id = pr.role_id
    where pr.profile_id = old.profile_id and pr.id <> old.id and rp.permission_key = 'admin.users'
  ) and exists (select 1 from public.role_permissions where role_id = old.role_id and permission_key = 'admin.users') then
    raise exception 'No puedes quitarte el rol con el que administras usuarios.' using errcode = 'EB001';
  end if;
  return old;
end;
$$;
create trigger profile_roles_guard_self_lockout before delete on public.profile_roles
for each row execute function public.guard_self_lockout_role();

revoke execute on function public.guard_self_lockout_profile() from public, anon, authenticated;
revoke execute on function public.guard_self_lockout_role() from public, anon, authenticated;
