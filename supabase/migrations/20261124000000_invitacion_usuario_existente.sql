-- Si el usuario ya existía en Supabase Auth cuando se crea su invitación (o el bootstrap),
-- se liga en ese momento. Antes quedaba en "Sin acceso todavía" porque solo se ligaba al crear el usuario.
create or replace function public.link_existing_user(inv_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  inv public.invitations;
  uid uuid;
  pid uuid;
begin
  select * into inv from public.invitations where id = inv_id and accepted_at is null;
  select u.id into uid from auth.users u where lower(u.email) = inv.email limit 1;
  if inv.id is null or uid is null or exists (select 1 from public.profiles where auth_user_id = uid) then
    return;
  end if;
  insert into public.profiles (auth_user_id, organization_id, email, full_name)
  values (uid, inv.organization_id, inv.email, '')
  returning id into pid;
  insert into public.profile_roles (organization_id, profile_id, role_id) values (inv.organization_id, pid, inv.role_id);
  update public.invitations set accepted_at = now() where id = inv.id;
end;
$$;
revoke execute on function public.link_existing_user(uuid) from public, anon, authenticated;

create or replace function public.accept_invitation_for_existing_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform public.link_existing_user(new.id);
  return new;
end;
$$;
revoke execute on function public.accept_invitation_for_existing_user() from public, anon, authenticated;

create trigger invitations_accept_existing_user after insert on public.invitations
for each row execute function public.accept_invitation_for_existing_user();

-- Repara las invitaciones pendientes de usuarios que ya existían antes de esta migración.
select public.link_existing_user(id) from public.invitations where accepted_at is null order by created_at;
