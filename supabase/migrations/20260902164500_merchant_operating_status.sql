alter table public.merchants
  add column if not exists deactivated_at timestamptz,
  add column if not exists deactivated_by uuid references public.profiles(id) on delete set null;

create or replace function public.dashboard_deactivate_merchant(p_merchant_id uuid, p_actor_id uuid)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public, gimml_terminal
as $$
declare affected_devices integer;
begin
  if not exists(select 1 from public.merchants where id=p_merchant_id and status <> 'archived') then raise exception 'active merchant not found'; end if;
  update public.merchants set status='inactive',deactivated_at=now(),deactivated_by=p_actor_id where id=p_merchant_id;
  update public.devices set status='inactive' where merchant_id=p_merchant_id;
  get diagnostics affected_devices = row_count;
  update gimml_terminal.merchants set billing_status='suspended' where id=p_merchant_id;
  update gimml_terminal.devices set enrollment_state='suspended',config_revision=config_revision+1 where merchant_id=p_merchant_id and enrollment_state <> 'suspended';
  return affected_devices;
end;
$$;

create or replace function public.dashboard_reactivate_merchant(p_merchant_id uuid, p_actor_id uuid)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public, gimml_terminal
as $$
declare attached_devices integer;
begin
  if not exists(select 1 from public.merchants where id=p_merchant_id and status='inactive') then raise exception 'inactive merchant not found'; end if;
  update public.merchants set status='active',deactivated_at=null,deactivated_by=null where id=p_merchant_id;
  update gimml_terminal.merchants unified
    set billing_status=source.billing_status
    from public.merchants source
    where unified.id=p_merchant_id and source.id=p_merchant_id;
  select count(*) into attached_devices from public.devices where merchant_id=p_merchant_id;
  return attached_devices;
end;
$$;

create or replace function public.dashboard_archive_merchant(p_merchant_id uuid, p_actor_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, gimml_terminal
as $$
begin
  if not exists(select 1 from public.merchants where id=p_merchant_id) then raise exception 'merchant not found'; end if;
  update public.merchants set status='archived',archived_at=now(),archived_by=p_actor_id where id=p_merchant_id;
  update public.devices set status='inactive' where merchant_id=p_merchant_id;
  update gimml_terminal.merchants set billing_status='suspended' where id=p_merchant_id;
  update gimml_terminal.devices set enrollment_state='suspended',config_revision=config_revision+1 where merchant_id=p_merchant_id and enrollment_state <> 'suspended';
  update public.merchant_integrations set enabled=false,status='disabled',updated_at=now(),updated_by=p_actor_id where merchant_id=p_merchant_id;
end;
$$;

revoke all on function public.dashboard_deactivate_merchant(uuid,uuid) from public, anon, authenticated;
revoke all on function public.dashboard_reactivate_merchant(uuid,uuid) from public, anon, authenticated;
revoke all on function public.dashboard_archive_merchant(uuid,uuid) from public, anon, authenticated;
grant execute on function public.dashboard_deactivate_merchant(uuid,uuid) to service_role;
grant execute on function public.dashboard_reactivate_merchant(uuid,uuid) to service_role;
grant execute on function public.dashboard_archive_merchant(uuid,uuid) to service_role;
