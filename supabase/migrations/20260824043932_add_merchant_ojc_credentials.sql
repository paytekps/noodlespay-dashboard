create table if not exists public.merchant_integrations (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants(id) on delete cascade,
  provider text not null check (provider in ('ojc')),
  credential_secret_id uuid,
  credential_hint text not null default '',
  organization_hint text not null default '',
  organization_name text,
  status text not null default 'configured'
    check (status in ('configured', 'verified', 'verification_failed', 'disconnected')),
  enabled boolean not null default true,
  last_verified_at timestamptz,
  last_verification_error text,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (merchant_id, provider),
  check (char_length(credential_hint) <= 254),
  check (char_length(organization_hint) <= 100),
  check (organization_name is null or char_length(organization_name) <= 254),
  check (last_verification_error is null or char_length(last_verification_error) <= 500)
);

alter table public.merchant_integrations enable row level security;
revoke all on table public.merchant_integrations from public, anon, authenticated;
grant select, insert, update, delete on table public.merchant_integrations to service_role;

drop policy if exists merchant_integrations_no_client_access
  on public.merchant_integrations;
create policy merchant_integrations_no_client_access
  on public.merchant_integrations
  for all
  to anon, authenticated
  using (false)
  with check (false);

create index if not exists merchant_integrations_created_by_idx
  on public.merchant_integrations (created_by);
create index if not exists merchant_integrations_updated_by_idx
  on public.merchant_integrations (updated_by);

create or replace function public.store_merchant_ojc_credential(
  p_merchant_id uuid,
  p_username text,
  p_password text,
  p_organization_id text,
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
  secret_name text := 'merchant_ojc_' || p_merchant_id::text;
  secret_payload text;
  username_hint text;
  organization_hint text;
begin
  if not exists (select 1 from public.merchants where id = p_merchant_id) then
    raise exception 'Merchant was not found.';
  end if;
  if p_username is null or btrim(p_username) = '' or char_length(p_username) > 254 then
    raise exception 'OJC username is required.';
  end if;
  if p_password is null or p_password = '' or char_length(p_password) > 512 then
    raise exception 'OJC password is required.';
  end if;
  if p_organization_id is null or btrim(p_organization_id) = '' or char_length(p_organization_id) > 500 then
    raise exception 'OJC organization ID is required.';
  end if;
  if p_username ~ '[[:cntrl:]]' or p_password ~ '[[:cntrl:]]' or p_organization_id ~ '[[:cntrl:]]' then
    raise exception 'OJC credentials contain invalid characters.';
  end if;

  secret_payload := jsonb_build_object(
    'username', btrim(p_username),
    'password', p_password,
    'organization_id', btrim(p_organization_id)
  )::text;

  select credential_secret_id
  into secret_id
  from public.merchant_integrations
  where merchant_id = p_merchant_id and provider = 'ojc';

  if secret_id is null then
    select vault.create_secret(
      secret_payload,
      secret_name,
      'Encrypted OJC credentials for merchant ' || p_merchant_id::text
    ) into secret_id;
  else
    perform vault.update_secret(
      secret_id,
      secret_payload,
      secret_name,
      'Encrypted OJC credentials for merchant ' || p_merchant_id::text
    );
  end if;

  username_hint := case
    when char_length(btrim(p_username)) = 1 then '*'
    when char_length(btrim(p_username)) = 2 then left(btrim(p_username), 1) || '*'
    else left(btrim(p_username), 1)
      || repeat('*', least(12, greatest(3, char_length(btrim(p_username)) - 2)))
      || right(btrim(p_username), 1)
  end;
  organization_hint := 'ending in ' || right(btrim(p_organization_id), least(4, char_length(btrim(p_organization_id))));

  insert into public.merchant_integrations (
    merchant_id,
    provider,
    credential_secret_id,
    credential_hint,
    organization_hint,
    status,
    enabled,
    last_verification_error,
    created_by,
    updated_by,
    updated_at
  ) values (
    p_merchant_id,
    'ojc',
    secret_id,
    username_hint,
    organization_hint,
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
    status = 'configured',
    enabled = true,
    last_verification_error = null,
    updated_by = excluded.updated_by,
    updated_at = now()
  returning * into integration;

  return integration;
end;
$$;

create or replace function public.read_merchant_ojc_credential(p_merchant_id uuid)
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
    and integration.provider = 'ojc'
    and integration.enabled
    and integration.status <> 'disconnected';
$$;

create or replace function public.disconnect_merchant_ojc_credential(
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
  where merchant_id = p_merchant_id and provider = 'ojc';

  if secret_id is not null then
    delete from vault.secrets where id = secret_id;
  end if;

  update public.merchant_integrations
  set credential_secret_id = null,
      credential_hint = '',
      organization_hint = '',
      status = 'disconnected',
      enabled = false,
      last_verification_error = null,
      updated_by = p_actor,
      updated_at = now()
  where merchant_id = p_merchant_id and provider = 'ojc';

  return found;
end;
$$;

revoke all on function public.store_merchant_ojc_credential(uuid, text, text, text, uuid) from public, anon, authenticated;
revoke all on function public.read_merchant_ojc_credential(uuid) from public, anon, authenticated;
revoke all on function public.disconnect_merchant_ojc_credential(uuid, uuid) from public, anon, authenticated;
grant execute on function public.store_merchant_ojc_credential(uuid, text, text, text, uuid) to service_role;
grant execute on function public.read_merchant_ojc_credential(uuid) to service_role;
grant execute on function public.disconnect_merchant_ojc_credential(uuid, uuid) to service_role;

;
