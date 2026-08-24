-- Add Pledger as the second merchant-configurable closed-loop provider.
alter table public.merchant_integrations
  drop constraint if exists merchant_integrations_provider_check;

alter table public.merchant_integrations
  add constraint merchant_integrations_provider_check
  check (provider in ('ojc', 'pledger'));

create or replace function public.store_merchant_pledger_credential(
  p_merchant_id uuid,
  p_api_token text,
  p_tax_id text,
  p_charity_name text,
  p_actor uuid
)
returns public.merchant_integrations
language plpgsql
security definer
set search_path = ''
as $$
declare
  integration public.merchant_integrations;
  secret_id uuid;
  secret_name text := 'merchant_pledger_' || p_merchant_id::text;
  secret_payload text;
  api_token text := btrim(coalesce(p_api_token, ''));
  tax_id text := regexp_replace(coalesce(p_tax_id, ''), '[^0-9]', '', 'g');
  charity_name text := btrim(coalesce(p_charity_name, ''));
begin
  if not exists (select 1 from public.merchants where id = p_merchant_id) then
    raise exception 'Merchant was not found.';
  end if;
  if api_token = '' or char_length(api_token) > 2048 then
    raise exception 'Pledger API token is required.';
  end if;
  if char_length(tax_id) <> 9 then
    raise exception 'Pledger tax ID must contain 9 digits.';
  end if;
  if charity_name = '' or char_length(charity_name) > 254 then
    raise exception 'Pledger charity name is required.';
  end if;
  if api_token ~ '[[:cntrl:]]' or charity_name ~ '[[:cntrl:]]' then
    raise exception 'Pledger credentials contain invalid characters.';
  end if;

  secret_payload := jsonb_build_object(
    'api_token', api_token,
    'tax_id', tax_id,
    'charity_name', charity_name
  )::text;

  select credential_secret_id
  into secret_id
  from public.merchant_integrations
  where merchant_id = p_merchant_id and provider = 'pledger';

  if secret_id is null then
    select vault.create_secret(
      secret_payload,
      secret_name,
      'Encrypted Pledger credentials for merchant ' || p_merchant_id::text
    ) into secret_id;
  else
    perform vault.update_secret(
      secret_id,
      secret_payload,
      secret_name,
      'Encrypted Pledger credentials for merchant ' || p_merchant_id::text
    );
  end if;

  insert into public.merchant_integrations (
    merchant_id,
    provider,
    credential_secret_id,
    credential_hint,
    organization_hint,
    organization_name,
    status,
    enabled,
    last_verification_error,
    created_by,
    updated_by,
    updated_at
  ) values (
    p_merchant_id,
    'pledger',
    secret_id,
    'ending in ' || right(api_token, least(4, char_length(api_token))),
    'Tax ID ending in ' || right(tax_id, 4),
    charity_name,
    'configured',
    true,
    null,
    p_actor,
    p_actor,
    now()
  )
  on conflict (merchant_id, provider) do update set
    credential_secret_id = excluded.credential_secret_id,
    credential_hint = excluded.credential_hint,
    organization_hint = excluded.organization_hint,
    organization_name = excluded.organization_name,
    status = 'configured',
    enabled = true,
    last_verification_error = null,
    updated_by = excluded.updated_by,
    updated_at = now()
  returning * into integration;

  return integration;
end;
$$;

create or replace function public.read_merchant_pledger_credential(p_merchant_id uuid)
returns jsonb
language sql
security definer
set search_path = ''
stable
as $$
  select decrypted.decrypted_secret::jsonb
  from public.merchant_integrations integration
  join vault.decrypted_secrets decrypted
    on decrypted.id = integration.credential_secret_id
  where integration.merchant_id = p_merchant_id
    and integration.provider = 'pledger'
    and integration.enabled
    and integration.status <> 'disconnected';
$$;

create or replace function public.disconnect_merchant_pledger_credential(
  p_merchant_id uuid,
  p_actor uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  secret_id uuid;
begin
  select credential_secret_id
  into secret_id
  from public.merchant_integrations
  where merchant_id = p_merchant_id and provider = 'pledger';

  if secret_id is not null then
    delete from vault.secrets where id = secret_id;
  end if;

  update public.merchant_integrations
  set credential_secret_id = null,
      credential_hint = '',
      organization_hint = '',
      organization_name = null,
      status = 'disconnected',
      enabled = false,
      last_verification_error = null,
      updated_by = p_actor,
      updated_at = now()
  where merchant_id = p_merchant_id and provider = 'pledger';

  return found;
end;
$$;

revoke all on function public.store_merchant_pledger_credential(uuid, text, text, text, uuid)
  from public, anon, authenticated;
revoke all on function public.read_merchant_pledger_credential(uuid)
  from public, anon, authenticated;
revoke all on function public.disconnect_merchant_pledger_credential(uuid, uuid)
  from public, anon, authenticated;

grant execute on function public.store_merchant_pledger_credential(uuid, text, text, text, uuid)
  to service_role;
grant execute on function public.read_merchant_pledger_credential(uuid)
  to service_role;
grant execute on function public.disconnect_merchant_pledger_credential(uuid, uuid)
  to service_role;
