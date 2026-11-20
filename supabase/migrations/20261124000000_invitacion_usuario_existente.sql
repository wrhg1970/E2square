-- Si el usuario ya existía en Supabase Auth cuando se crea su invitación (o el bootstrap),
-- se liga en ese momento. Antes quedaba en "Sin acceso todavía" porque solo se ligaba al crear el usuario.
create or replace function public.accept_invitation_for_existing_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  uid uuid;
  pid uuid;
begin
  select u.id into uid
  from auth.users u where lower(u.email) = new.email limit 1;
  if uid is null or exists (select 1 from public.profiles where auth_user_id = uid) then
    return new;
  end if;
  insert into public.profiles (auth_user_id, organization_id, email, full_name)
  values (uid, new.organization_id, new.email, '')
  returning id into pid;
  insert into public.profile_roles (organization_id, profile_id, role_id) values (new.organization_id, pid, new.role_id);
  update public.invitations set accepted_at = now() where id = new.id;
  return new;
end;
$$;
revoke execute on function public.accept_invitation_for_existing_user() from public, anon, authenticated;

create trigger invitations_accept_existing_user after insert on public.invitations
for each row execute function public.accept_invitation_for_existing_user();
