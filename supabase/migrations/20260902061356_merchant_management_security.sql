alter table public.merchants
  add column if not exists legal_business_name text,
  add column if not exists dba_name text,
  add column if not exists primary_contact_name text,
  add column if not exists primary_contact_email text,
  add column if not exists primary_contact_phone text,
  add column if not exists address_line_1 text,
  add column if not exists address_line_2 text,
  add column if not exists city text,
  add column if not exists state_region text,
  add column if not exists postal_code text,
  add column if not exists country_code char(2) not null default 'US',
  add column if not exists website text,
  add column if not exists business_type text,
  add column if not exists currency char(3) not null default 'USD',
  add column if not exists timezone text not null default 'America/New_York',
  add column if not exists billing_status text not null default 'trialing',
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references public.profiles(id) on delete set null;

alter table public.merchants drop constraint if exists merchants_primary_contact_email_check;
alter table public.merchants add constraint merchants_primary_contact_email_check
  check (primary_contact_email is null or primary_contact_email ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$');
alter table public.merchants drop constraint if exists merchants_country_code_check;
alter table public.merchants add constraint merchants_country_code_check check (country_code ~ '^[A-Z]{2}$');
alter table public.merchants drop constraint if exists merchants_currency_check;
alter table public.merchants add constraint merchants_currency_check check (currency ~ '^[A-Z]{3}$');
alter table public.merchants drop constraint if exists merchants_status_check;
alter table public.merchants add constraint merchants_status_check check (status in ('active','inactive','archived'));
alter table public.merchants drop constraint if exists merchants_billing_status_check;
alter table public.merchants add constraint merchants_billing_status_check check (billing_status in ('trialing','active','past_due','suspended','cancelled'));

create or replace function public.dashboard_create_merchant(p_details jsonb)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, gimml_terminal
as $$
declare
  merchant_id uuid := gen_random_uuid();
  merchant_name text := nullif(btrim(p_details->>'name'), '');
  merchant_slug text := nullif(btrim(p_details->>'slug'), '');
  merchant_currency text := upper(coalesce(nullif(btrim(p_details->>'currency'), ''), 'USD'));
  merchant_country text := upper(coalesce(nullif(btrim(p_details->>'countryCode'), ''), 'US'));
  merchant_timezone text := coalesce(nullif(btrim(p_details->>'timezone'), ''), 'America/New_York');
  merchant_billing text := coalesce(nullif(btrim(p_details->>'billingStatus'), ''), 'trialing');
  rep_id uuid;
begin
  if merchant_name is null or char_length(merchant_name) > 160 then raise exception 'invalid merchant name'; end if;
  if merchant_slug is null or merchant_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' then raise exception 'invalid merchant slug'; end if;
  if merchant_currency !~ '^[A-Z]{3}$' then raise exception 'invalid currency'; end if;
  if merchant_country !~ '^[A-Z]{2}$' then raise exception 'invalid country'; end if;
  if merchant_billing not in ('trialing','active','past_due','suspended','cancelled') then raise exception 'invalid billing status'; end if;
  if nullif(p_details->>'salesRepId','') is not null then
    rep_id := (p_details->>'salesRepId')::uuid;
    if not exists(select 1 from public.sales_reps where id=rep_id) then raise exception 'invalid sales representative'; end if;
  end if;

  insert into public.merchants(
    id,name,slug,status,sales_rep_id,legal_business_name,dba_name,primary_contact_name,
    primary_contact_email,primary_contact_phone,address_line_1,address_line_2,city,state_region,
    postal_code,country_code,website,business_type,currency,timezone,billing_status
  ) values (
    merchant_id,merchant_name,merchant_slug,'active',rep_id,nullif(btrim(p_details->>'legalBusinessName'),''),
    nullif(btrim(p_details->>'dbaName'),''),nullif(btrim(p_details->>'primaryContactName'),''),
    nullif(lower(btrim(p_details->>'primaryContactEmail')),''),nullif(btrim(p_details->>'primaryContactPhone'),''),
    nullif(btrim(p_details->>'addressLine1'),''),nullif(btrim(p_details->>'addressLine2'),''),
    nullif(btrim(p_details->>'city'),''),nullif(btrim(p_details->>'stateRegion'),''),
    nullif(btrim(p_details->>'postalCode'),''),merchant_country,nullif(btrim(p_details->>'website'),''),
    nullif(btrim(p_details->>'businessType'),''),merchant_currency,merchant_timezone,merchant_billing
  );
  insert into gimml_terminal.merchants(id,display_name,currency,timezone,billing_status)
  values(merchant_id,merchant_name,merchant_currency,merchant_timezone,merchant_billing);
  if rep_id is not null then
    insert into public.sales_rep_merchants(sales_rep_id,merchant_id) values(rep_id,merchant_id);
  end if;
  return merchant_id;
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
  update gimml_terminal.devices set enrollment_state='suspended',config_revision=config_revision+1 where merchant_id=p_merchant_id;
  update public.merchant_integrations set enabled=false,status='disabled',updated_at=now(),updated_by=p_actor_id where merchant_id=p_merchant_id;
end;
$$;

create or replace function public.dashboard_purge_test_merchant(p_merchant_id uuid, p_confirm_name text)
returns uuid[]
language plpgsql
security definer
set search_path = pg_catalog, public, gimml_terminal, vault
as $$
declare
  actual_name text;
  linked_users uuid[];
  secret_ids uuid[];
begin
  select name into actual_name from public.merchants where id=p_merchant_id for update;
  if actual_name is null then raise exception 'merchant not found'; end if;
  if p_confirm_name is distinct from actual_name then raise exception 'merchant name confirmation does not match'; end if;
  if exists(select 1 from public.transactions where merchant_id=p_merchant_id)
    or exists(select 1 from public.transaction_actions where merchant_id=p_merchant_id)
    or exists(select 1 from public.settlement_runs where merchant_id=p_merchant_id)
    or exists(select 1 from gimml_terminal.transactions where merchant_id=p_merchant_id)
    or exists(select 1 from gimml_terminal.billing_events where merchant_id=p_merchant_id)
    or exists(select 1 from gimml_terminal.merchant_subscriptions where merchant_id=p_merchant_id and (external_customer_id is not null or external_subscription_id is not null))
  then raise exception 'merchant has financial history and must be archived'; end if;

  select coalesce(array_agg(id),'{}'::uuid[]) into linked_users from public.profiles where merchant_id=p_merchant_id;
  select coalesce(array_agg(credential_secret_id) filter(where credential_secret_id is not null),'{}'::uuid[])
    into secret_ids from public.merchant_integrations where merchant_id=p_merchant_id;

  delete from gimml_terminal.transaction_events where transaction_id in (select id from gimml_terminal.transactions where merchant_id=p_merchant_id);
  delete from gimml_terminal.config_snapshots where device_id in (select id from gimml_terminal.devices where merchant_id=p_merchant_id);
  delete from gimml_terminal.device_assignments where device_id in (select id from gimml_terminal.devices where merchant_id=p_merchant_id)
    or entitlement_id in (select id from gimml_terminal.merchant_entitlements where merchant_id=p_merchant_id);
  delete from gimml_terminal.device_commands where merchant_id=p_merchant_id;
  delete from gimml_terminal.device_profiles where device_id in (select id from gimml_terminal.devices where merchant_id=p_merchant_id);
  delete from gimml_terminal.device_settings where device_id in (select id from gimml_terminal.devices where merchant_id=p_merchant_id);
  delete from gimml_terminal.device_location_requests where device_id in (select id from gimml_terminal.devices where merchant_id=p_merchant_id);
  delete from gimml_terminal.device_pairing_codes where device_id in (select id from gimml_terminal.devices where merchant_id=p_merchant_id);
  delete from gimml_terminal.device_request_nonces where device_id in (select id from gimml_terminal.devices where merchant_id=p_merchant_id);
  delete from gimml_terminal.device_status where device_id in (select id from gimml_terminal.devices where merchant_id=p_merchant_id);
  delete from gimml_terminal.transactions where merchant_id=p_merchant_id;
  delete from gimml_terminal.devices where merchant_id=p_merchant_id;
  delete from gimml_terminal.merchant_entitlements where merchant_id=p_merchant_id;
  delete from gimml_terminal.merchant_settings where merchant_id=p_merchant_id;
  delete from gimml_terminal.closed_loop_programs where merchant_id=p_merchant_id;
  delete from gimml_terminal.merchant_subscriptions where merchant_id=p_merchant_id;
  delete from gimml_terminal.audit_events where merchant_id=p_merchant_id;
  delete from gimml_terminal.merchants where id=p_merchant_id;

  delete from public.device_config where device_id in (select id from public.devices where merchant_id=p_merchant_id);
  delete from public.device_command_credentials where device_id in (select id from public.devices where merchant_id=p_merchant_id);
  delete from public.device_pairing_codes where device_id in (select id from public.devices where merchant_id=p_merchant_id);
  delete from public.device_config_history where merchant_id=p_merchant_id;
  delete from public.device_provisioning_history where merchant_id=p_merchant_id;
  delete from public.device_provisioning_profiles where merchant_id=p_merchant_id;
  delete from public.device_settlement_schedules where merchant_id=p_merchant_id;
  delete from public.devices where merchant_id=p_merchant_id;
  delete from public.closed_loop_cards where merchant_id=p_merchant_id;
  delete from public.merchant_features where merchant_id=p_merchant_id;
  delete from public.sales_rep_merchants where merchant_id=p_merchant_id;
  delete from public.merchant_integrations where merchant_id=p_merchant_id;
  delete from public.profiles where merchant_id=p_merchant_id;
  delete from public.merchants where id=p_merchant_id;
  delete from vault.secrets where id=any(secret_ids);
  return linked_users;
end;
$$;

revoke all on function public.dashboard_create_merchant(jsonb) from public, anon, authenticated;
revoke all on function public.dashboard_archive_merchant(uuid,uuid) from public, anon, authenticated;
revoke all on function public.dashboard_purge_test_merchant(uuid,text) from public, anon, authenticated;
grant execute on function public.dashboard_create_merchant(jsonb) to service_role;
grant execute on function public.dashboard_archive_merchant(uuid,uuid) to service_role;
grant execute on function public.dashboard_purge_test_merchant(uuid,text) to service_role;

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'merchants','devices','profiles','device_profiles','capabilities','catalog_items','merchant_entitlements',
    'device_assignments','merchant_settings','device_settings','closed_loop_programs','transactions','transaction_events',
    'device_commands','config_snapshots','audit_events','device_request_nonces','device_pairing_codes','device_status',
    'device_location_requests','plans','plan_items','merchant_subscriptions','billing_events'
  ] loop
    execute format('alter table gimml_terminal.%I enable row level security',table_name);
    execute format('revoke all on table gimml_terminal.%I from anon, authenticated',table_name);
  end loop;
end;
$$;
