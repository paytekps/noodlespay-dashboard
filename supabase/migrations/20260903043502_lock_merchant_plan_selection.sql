begin;
insert into public.dashboard_role_permissions(role, permission_key, allowed, updated_at)
values ('merchant', 'plans.select', false, now())
on conflict (role, permission_key)
do update set allowed = excluded.allowed, updated_at = excluded.updated_at;
grant execute on function gimml_terminal.bump_device_revision(uuid) to service_role;
commit;;
