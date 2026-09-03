alter table public.merchants
  add column if not exists is_test boolean not null default false;

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
  merchant_is_test boolean := coalesce((p_details->>'isTest')::boolean, false);
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
    postal_code,country_code,website,business_type,currency,timezone,billing_status,is_test
  ) values (
    merchant_id,merchant_name,merchant_slug,'active',rep_id,nullif(btrim(p_details->>'legalBusinessName'),''),
    nullif(btrim(p_details->>'dbaName'),''),nullif(btrim(p_details->>'primaryContactName'),''),
    nullif(lower(btrim(p_details->>'primaryContactEmail')),''),nullif(btrim(p_details->>'primaryContactPhone'),''),
    nullif(btrim(p_details->>'addressLine1'),''),nullif(btrim(p_details->>'addressLine2'),''),
    nullif(btrim(p_details->>'city'),''),nullif(btrim(p_details->>'stateRegion'),''),
    nullif(btrim(p_details->>'postalCode'),''),merchant_country,nullif(btrim(p_details->>'website'),''),
    nullif(btrim(p_details->>'businessType'),''),merchant_currency,merchant_timezone,merchant_billing,merchant_is_test
  );
  insert into gimml_terminal.merchants(id,display_name,currency,timezone,billing_status)
  values(merchant_id,merchant_name,merchant_currency,merchant_timezone,merchant_billing);
  if rep_id is not null then
    insert into public.sales_rep_merchants(sales_rep_id,merchant_id) values(rep_id,merchant_id);
  end if;
  return merchant_id;
end;
$$;

create or replace function public.dashboard_purge_empty_merchant(p_merchant_id uuid, p_confirm_name text)
returns uuid[]
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if not coalesce((select is_test from public.merchants where id=p_merchant_id), false) then
    raise exception 'merchant is not designated as test';
  end if;
  return public.dashboard_purge_test_merchant(p_merchant_id, p_confirm_name);
end;
$$;

revoke all on function public.dashboard_purge_test_merchant(uuid,text) from service_role;
revoke all on function public.dashboard_purge_empty_merchant(uuid,text) from public, anon, authenticated;
grant execute on function public.dashboard_purge_empty_merchant(uuid,text) to service_role;;
