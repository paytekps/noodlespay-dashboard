-- Add Vault-backed merchant configuration for The Donors Fund.
alter table public.merchant_integrations drop constraint if exists merchant_integrations_provider_check;
alter table public.merchant_integrations add constraint merchant_integrations_provider_check
  check (provider in ('ojc', 'pledger', 'matbia', 'donors_fund'));

create or replace function public.store_merchant_donors_fund_credential(
  p_merchant_id uuid, p_validation_token text, p_tax_id text,
  p_account_number text, p_actor uuid
) returns public.merchant_integrations
language plpgsql security definer set search_path = '' as $$
declare
  integration public.merchant_integrations;
  secret_id uuid;
  token text := btrim(coalesce(p_validation_token, ''));
  tax_id text := regexp_replace(coalesce(p_tax_id, ''), '[^0-9]', '', 'g');
  account_number text := regexp_replace(coalesce(p_account_number, ''), '[^0-9]', '', 'g');
begin
  if not exists (select 1 from public.merchants where id = p_merchant_id) then raise exception 'Merchant was not found.'; end if;
  if token = '' or char_length(token) > 2048 or token ~ '[[:cntrl:]]' then raise exception 'Invalid validation token.'; end if;
  if tax_id !~ '^[0-9]{9}$' then raise exception 'Invalid charity tax ID.'; end if;
  if account_number !~ '^[0-9]{7}$' then raise exception 'Invalid charity account number.'; end if;
  select credential_secret_id into secret_id from public.merchant_integrations where merchant_id = p_merchant_id and provider = 'donors_fund';
  if secret_id is null then
    select vault.create_secret(jsonb_build_object('validation_token', token, 'tax_id', tax_id, 'account_number', account_number)::text, 'merchant_donors_fund_' || p_merchant_id::text, 'Encrypted Donors Fund credentials') into secret_id;
  else
    perform vault.update_secret(secret_id, jsonb_build_object('validation_token', token, 'tax_id', tax_id, 'account_number', account_number)::text, 'merchant_donors_fund_' || p_merchant_id::text, 'Encrypted Donors Fund credentials');
  end if;
  insert into public.merchant_integrations (merchant_id, provider, credential_secret_id, credential_hint, organization_hint, organization_name, status, enabled, created_by, updated_by, updated_at)
  values (p_merchant_id, 'donors_fund', secret_id, 'Token ending in ' || right(token, least(4, char_length(token))), 'Tax ID ending in ' || right(tax_id, 4), 'Account ending in ' || right(account_number, 4), 'configured', true, p_actor, p_actor, now())
  on conflict (merchant_id, provider) do update set credential_secret_id = excluded.credential_secret_id, credential_hint = excluded.credential_hint, organization_hint = excluded.organization_hint, organization_name = excluded.organization_name, status = 'configured', enabled = true, last_verification_error = null, updated_by = excluded.updated_by, updated_at = now()
  returning * into integration;
  return integration;
end;
$$;

create or replace function public.read_merchant_donors_fund_credential(p_merchant_id uuid)
returns jsonb language sql security definer set search_path = '' stable as $$
  select secret.decrypted_secret::jsonb from public.merchant_integrations integration
  join vault.decrypted_secrets secret on secret.id = integration.credential_secret_id
  where integration.merchant_id = p_merchant_id and integration.provider = 'donors_fund' and integration.enabled and integration.status <> 'disconnected';
$$;

create or replace function public.disconnect_merchant_donors_fund_credential(p_merchant_id uuid, p_actor uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare secret_id uuid;
begin
  select credential_secret_id into secret_id from public.merchant_integrations where merchant_id = p_merchant_id and provider = 'donors_fund';
  if secret_id is not null then delete from vault.secrets where id = secret_id; end if;
  update public.merchant_integrations set credential_secret_id = null, credential_hint = '', organization_hint = '', organization_name = null, status = 'disconnected', enabled = false, last_verification_error = null, updated_by = p_actor, updated_at = now() where merchant_id = p_merchant_id and provider = 'donors_fund';
  return found;
end;
$$;

revoke all on function public.store_merchant_donors_fund_credential(uuid, text, text, text, uuid) from public, anon, authenticated;
revoke all on function public.read_merchant_donors_fund_credential(uuid) from public, anon, authenticated;
revoke all on function public.disconnect_merchant_donors_fund_credential(uuid, uuid) from public, anon, authenticated;
grant execute on function public.store_merchant_donors_fund_credential(uuid, text, text, text, uuid) to service_role;
grant execute on function public.read_merchant_donors_fund_credential(uuid) to service_role;
grant execute on function public.disconnect_merchant_donors_fund_credential(uuid, uuid) to service_role;
