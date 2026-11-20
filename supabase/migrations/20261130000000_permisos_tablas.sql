-- Los proyectos nuevos de Supabase ya no otorgan automáticamente privilegios de tabla a `authenticated`
-- para tablas creadas por migración. Sin esto la app no puede leer ni su propio perfil ("Sin acceso todavía").
-- La seguridad por fila sigue en las políticas RLS de cada tabla; `anon` no recibe nada.
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
alter default privileges in schema public grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public grant usage, select on sequences to authenticated;
