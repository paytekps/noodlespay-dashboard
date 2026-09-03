create table if not exists public.device_pairing_codes (
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null references public.devices(id) on delete cascade,
  code_hash text not null check (code_hash ~ '^[0-9a-f]{64}$'),
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz,
  check (expires_at > created_at)
);

create index if not exists device_pairing_codes_device_created_idx
  on public.device_pairing_codes (device_id, created_at desc);

create index if not exists device_pairing_codes_expiry_idx
  on public.device_pairing_codes (expires_at)
  where used_at is null;

alter table public.device_pairing_codes enable row level security;
revoke all on table public.device_pairing_codes from public, anon, authenticated;
grant select, insert, update, delete on table public.device_pairing_codes to service_role;

create or replace function public.enroll_device_command_credential(
  p_device_id uuid,
  p_pairing_code_hash text,
  p_token_hash text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  paired_code_id uuid;
begin
  if p_pairing_code_hash !~ '^[0-9a-f]{64}$'
      or p_token_hash !~ '^[0-9a-f]{64}$' then
    return false;
  end if;

  select code.id into paired_code_id
  from public.device_pairing_codes code
  where code.device_id = p_device_id
    and code.code_hash = p_pairing_code_hash
    and code.used_at is null
    and code.expires_at > now()
  order by code.created_at desc
  for update skip locked
  limit 1;

  if paired_code_id is null then
    return false;
  end if;

  update public.device_pairing_codes
  set used_at = now()
  where id = paired_code_id;

  insert into public.device_command_credentials (device_id, token_hash)
  values (p_device_id, p_token_hash)
  on conflict (device_id) do update
  set token_hash = excluded.token_hash,
      rotated_at = now(),
      disabled_at = null;

  return true;
end;
$$;

revoke all on function public.enroll_device_command_credential(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.enroll_device_command_credential(uuid, text, text)
  to service_role;

;
