create or replace function public.device_provisioning_extra_is_safe(p_value jsonb)
returns boolean
language sql
immutable
strict
set search_path = ''
as $$
  select jsonb_typeof(p_value) = 'object'
    and not exists (
      select 1
      from jsonb_object_keys(p_value) as item(key_name)
      where item.key_name ~* '(password|passcode|secret|token|cryptographic|encryption|private[_ -]?key|master[_ -]?key|working[_ -]?key|pin|cvv|cvc|full[_ -]?pan|card[_ -]?number)'
    );
$$;

revoke all on function public.device_provisioning_extra_is_safe(jsonb)
  from public, anon, authenticated;
grant execute on function public.device_provisioning_extra_is_safe(jsonb) to service_role;

create or replace function public.is_valid_timezone(p_value text)
returns boolean
language sql
stable
strict
set search_path = ''
as $$
  select exists (
    select 1
    from pg_catalog.pg_timezone_names() zone
    where zone.name = p_value
  );
$$;

revoke all on function public.is_valid_timezone(text) from public, anon, authenticated;
grant execute on function public.is_valid_timezone(text) to service_role;

create table if not exists public.device_provisioning_profiles (
  device_id uuid primary key references public.devices(id) on delete cascade,
  merchant_id uuid not null references public.merchants(id) on delete restrict,
  activation_status text not null default 'draft'
    check (activation_status in ('draft', 'processor_approved', 'configuring', 'ready', 'active', 'suspended')),
  deployment_environment text not null default 'test'
    check (deployment_environment in ('test', 'production')),
  processor_name text not null default '' check (char_length(processor_name) <= 120),
  processor_platform text not null default '' check (char_length(processor_platform) <= 120),
  capture_mode text not null default 'host'
    check (capture_mode in ('host', 'terminal')),
  iso_or_var_name text not null default '' check (char_length(iso_or_var_name) <= 120),
  boarding_reference text not null default '' check (char_length(boarding_reference) <= 120),
  merchant_identification_number text not null default ''
    check (char_length(merchant_identification_number) <= 80),
  terminal_identification_number text not null default ''
    check (char_length(terminal_identification_number) <= 80),
  terminal_number text not null default '' check (char_length(terminal_number) <= 80),
  store_number text not null default '' check (char_length(store_number) <= 80),
  chain_number text not null default '' check (char_length(chain_number) <= 80),
  agent_bank_number text not null default '' check (char_length(agent_bank_number) <= 80),
  acquirer_bin text not null default '' check (char_length(acquirer_bin) <= 80),
  merchant_location_number text not null default ''
    check (char_length(merchant_location_number) <= 80),
  merchant_category_code text not null default ''
    check (merchant_category_code = '' or merchant_category_code ~ '^[0-9]{4}$'),
  merchant_legal_name text not null default '' check (char_length(merchant_legal_name) <= 160),
  merchant_dba_name text not null default '' check (char_length(merchant_dba_name) <= 160),
  statement_descriptor text not null default '' check (char_length(statement_descriptor) <= 40),
  merchant_phone text not null default '' check (char_length(merchant_phone) <= 40),
  address_line_1 text not null default '' check (char_length(address_line_1) <= 160),
  address_line_2 text not null default '' check (char_length(address_line_2) <= 160),
  city text not null default '' check (char_length(city) <= 100),
  state_or_region text not null default '' check (char_length(state_or_region) <= 100),
  postal_code text not null default '' check (char_length(postal_code) <= 30),
  country_code text not null default 'US'
    check (country_code ~ '^[A-Z]{2}$'),
  currency_code text not null default 'USD'
    check (currency_code ~ '^[A-Z]{3}$'),
  time_zone text not null default 'America/New_York'
    check (public.is_valid_timezone(time_zone)),
  terminal_environment text not null default 'unattended'
    check (terminal_environment in ('attended', 'unattended', 'semi_attended')),
  terminal_type text not null default 'Datecs BlueCash-05'
    check (char_length(terminal_type) <= 120),
  terminal_capability text not null default 'contact_and_contactless'
    check (terminal_capability in ('contact', 'contactless', 'contact_and_contactless')),
  primary_host text not null default '' check (char_length(primary_host) <= 255),
  primary_port integer check (primary_port between 1 and 65535),
  secondary_host text not null default '' check (char_length(secondary_host) <= 255),
  secondary_port integer check (secondary_port between 1 and 65535),
  host_transport text not null default 'tls'
    check (host_transport in ('tls', 'tcp')),
  gateway_name text not null default '' check (char_length(gateway_name) <= 120),
  gateway_merchant_id text not null default '' check (char_length(gateway_merchant_id) <= 120),
  gateway_terminal_id text not null default '' check (char_length(gateway_terminal_id) <= 120),
  var_id text not null default '' check (char_length(var_id) <= 120),
  software_id text not null default '' check (char_length(software_id) <= 120),
  payment_application_name text not null default 'NoodlPay'
    check (char_length(payment_application_name) <= 120),
  payment_application_version text not null default ''
    check (char_length(payment_application_version) <= 60),
  tms_profile_name text not null default '' check (char_length(tms_profile_name) <= 120),
  tms_config_version text not null default '' check (char_length(tms_config_version) <= 120),
  tms_download_status text not null default 'not_started'
    check (tms_download_status in ('not_started', 'scheduled', 'in_progress', 'complete', 'failed')),
  key_injection_status text not null default 'not_started'
    check (key_injection_status in ('not_started', 'scheduled', 'complete', 'failed')),
  processor_approved boolean not null default false,
  hardware_received boolean not null default false,
  network_ready boolean not null default false,
  tid_assigned boolean not null default false,
  tms_profile_ready boolean not null default false,
  contact_emv_certified boolean not null default false,
  contactless_emv_certified boolean not null default false,
  closed_loop_configured boolean not null default false,
  test_sale_passed boolean not null default false,
  test_void_passed boolean not null default false,
  test_refund_passed boolean not null default false,
  test_settlement_passed boolean not null default false,
  receipt_verified boolean not null default false,
  reporting_verified boolean not null default false,
  processor_support_phone text not null default '' check (char_length(processor_support_phone) <= 40),
  processor_support_email text not null default '' check (char_length(processor_support_email) <= 254),
  notes text not null default '' check (char_length(notes) <= 4000),
  processor_specific jsonb not null default '{}'::jsonb
    check (public.device_provisioning_extra_is_safe(processor_specific)),
  created_by uuid not null references public.profiles(id) on delete restrict,
  updated_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists device_provisioning_profiles_merchant_id_idx
  on public.device_provisioning_profiles (merchant_id);
create index if not exists device_provisioning_profiles_created_by_idx
  on public.device_provisioning_profiles (created_by);
create index if not exists device_provisioning_profiles_updated_by_idx
  on public.device_provisioning_profiles (updated_by);

create table if not exists public.device_provisioning_history (
  id bigint generated by default as identity primary key,
  device_id uuid not null references public.devices(id) on delete cascade,
  merchant_id uuid not null references public.merchants(id) on delete restrict,
  changed_by uuid references public.profiles(id) on delete set null,
  action text not null check (action in ('created', 'updated')),
  previous_values jsonb,
  current_values jsonb not null,
  changed_at timestamptz not null default now()
);

create index if not exists device_provisioning_history_device_changed_idx
  on public.device_provisioning_history (device_id, changed_at desc);
create index if not exists device_provisioning_history_merchant_id_idx
  on public.device_provisioning_history (merchant_id);
create index if not exists device_provisioning_history_changed_by_idx
  on public.device_provisioning_history (changed_by);

create or replace function public.record_device_provisioning_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.updated_at := now();
  insert into public.device_provisioning_history (
    device_id,
    merchant_id,
    changed_by,
    action,
    previous_values,
    current_values
  ) values (
    new.device_id,
    new.merchant_id,
    new.updated_by,
    case when tg_op = 'INSERT' then 'created' else 'updated' end,
    case when tg_op = 'INSERT' then null else to_jsonb(old) end,
    to_jsonb(new)
  );
  return new;
end;
$$;

revoke all on function public.record_device_provisioning_change()
  from public, anon, authenticated;

drop trigger if exists record_device_provisioning_change
  on public.device_provisioning_profiles;
create trigger record_device_provisioning_change
before insert or update on public.device_provisioning_profiles
for each row execute function public.record_device_provisioning_change();

create table if not exists public.device_settlement_schedules (
  device_id uuid primary key references public.devices(id) on delete cascade,
  merchant_id uuid not null references public.merchants(id) on delete restrict,
  enabled boolean not null default false,
  settlement_time time without time zone not null default time '03:00',
  time_zone text not null default 'America/New_York'
    check (public.is_valid_timezone(time_zone)),
  updated_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists device_settlement_schedules_merchant_id_idx
  on public.device_settlement_schedules (merchant_id);
create index if not exists device_settlement_schedules_updated_by_idx
  on public.device_settlement_schedules (updated_by);

create table if not exists public.settlement_runs (
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null references public.devices(id) on delete restrict,
  merchant_id uuid not null references public.merchants(id) on delete restrict,
  business_date date not null,
  scheduled_for timestamptz,
  request_source text not null check (request_source in ('scheduled', 'manual')),
  status text not null default 'queued'
    check (status in ('queued', 'processing', 'succeeded', 'failed', 'cancelled', 'expired')),
  requested_by uuid references public.profiles(id) on delete restrict,
  requested_at timestamptz not null default now(),
  processing_started_at timestamptz,
  completed_at timestamptz,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  transaction_count integer check (transaction_count >= 0),
  total_amount numeric(14, 2) check (total_amount >= 0),
  batch_id text check (batch_id is null or char_length(batch_id) <= 120),
  device_message text check (device_message is null or char_length(device_message) <= 500)
);

create index if not exists settlement_runs_device_queue_idx
  on public.settlement_runs (device_id, requested_at)
  where status = 'queued';
create index if not exists settlement_runs_device_history_idx
  on public.settlement_runs (device_id, requested_at desc);
create index if not exists settlement_runs_merchant_history_idx
  on public.settlement_runs (merchant_id, requested_at desc);
create index if not exists settlement_runs_requested_by_idx
  on public.settlement_runs (requested_by);
create unique index if not exists settlement_runs_one_scheduled_per_business_day
  on public.settlement_runs (device_id, business_date)
  where request_source = 'scheduled';
create unique index if not exists settlement_runs_one_active_per_device
  on public.settlement_runs (device_id)
  where status in ('queued', 'processing');

alter table public.device_provisioning_profiles enable row level security;
alter table public.device_provisioning_history enable row level security;
alter table public.device_settlement_schedules enable row level security;
alter table public.settlement_runs enable row level security;

revoke all on table public.device_provisioning_profiles,
  public.device_provisioning_history,
  public.device_settlement_schedules,
  public.settlement_runs
  from public, anon, authenticated;
grant select, insert, update, delete on table public.device_provisioning_profiles,
  public.device_provisioning_history,
  public.device_settlement_schedules,
  public.settlement_runs
  to service_role;
grant usage, select on sequence public.device_provisioning_history_id_seq to service_role;

create or replace function public.queue_due_device_settlements(p_now timestamptz default now())
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  schedule_row record;
  local_now timestamp without time zone;
  due_at timestamptz;
  inserted_count integer := 0;
begin
  for schedule_row in
    select schedule.*, profile.capture_mode, profile.activation_status,
      profile.key_injection_status, profile.merchant_identification_number,
      profile.terminal_identification_number
    from public.device_settlement_schedules schedule
    join public.device_provisioning_profiles profile
      on profile.device_id = schedule.device_id
    join public.devices device on device.id = schedule.device_id
    where schedule.enabled
      and profile.capture_mode = 'terminal'
      and profile.activation_status = 'active'
      and profile.key_injection_status = 'complete'
      and profile.merchant_identification_number <> ''
      and profile.terminal_identification_number <> ''
      and device.status = 'active'
  loop
    local_now := p_now at time zone schedule_row.time_zone;
    if local_now::time >= schedule_row.settlement_time then
      due_at := (
        local_now::date + schedule_row.settlement_time
      ) at time zone schedule_row.time_zone;

      insert into public.settlement_runs (
        device_id,
        merchant_id,
        business_date,
        scheduled_for,
        request_source
      ) values (
        schedule_row.device_id,
        schedule_row.merchant_id,
        local_now::date,
        due_at,
        'scheduled'
      )
      on conflict (device_id, business_date)
        where request_source = 'scheduled'
      do nothing;

      if found then
        inserted_count := inserted_count + 1;
      end if;
    end if;
  end loop;

  return inserted_count;
end;
$$;

revoke all on function public.queue_due_device_settlements(timestamptz)
  from public, anon, authenticated;
grant execute on function public.queue_due_device_settlements(timestamptz) to service_role;

create or replace function public.claim_device_settlement(p_device_id uuid)
returns setof public.settlement_runs
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.settlement_runs run
  set status = case when run.attempt_count >= 3 then 'failed' else 'queued' end,
      processing_started_at = null,
      completed_at = case when run.attempt_count >= 3 then now() else null end,
      device_message = case
        when run.attempt_count >= 3 then 'Device did not finish settlement after three attempts.'
        else run.device_message
      end
  where run.device_id = p_device_id
    and run.status = 'processing'
    and run.processing_started_at < now() - interval '10 minutes';

  return query
  with next_run as (
    select queued.id
    from public.settlement_runs queued
    where queued.device_id = p_device_id
      and queued.status = 'queued'
    order by queued.requested_at
    for update skip locked
    limit 1
  )
  update public.settlement_runs run
  set status = 'processing',
      processing_started_at = now(),
      attempt_count = run.attempt_count + 1
  from next_run
  where run.id = next_run.id
  returning run.*;
end;
$$;

revoke all on function public.claim_device_settlement(uuid)
  from public, anon, authenticated;
grant execute on function public.claim_device_settlement(uuid) to service_role;

create or replace function public.complete_device_settlement(
  p_device_id uuid,
  p_run_id uuid,
  p_success boolean,
  p_message text,
  p_transaction_count integer,
  p_total_amount numeric,
  p_batch_id text
)
returns setof public.settlement_runs
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  update public.settlement_runs run
  set status = case when p_success then 'succeeded' else 'failed' end,
      completed_at = now(),
      transaction_count = case
        when p_transaction_count is null then null else greatest(0, p_transaction_count)
      end,
      total_amount = case
        when p_total_amount is null then null else greatest(0, p_total_amount)
      end,
      batch_id = nullif(left(coalesce(p_batch_id, ''), 120), ''),
      device_message = nullif(left(coalesce(p_message, ''), 500), '')
  where run.id = p_run_id
    and run.device_id = p_device_id
    and run.status = 'processing'
  returning run.*;
end;
$$;

revoke all on function public.complete_device_settlement(
  uuid, uuid, boolean, text, integer, numeric, text
) from public, anon, authenticated;
grant execute on function public.complete_device_settlement(
  uuid, uuid, boolean, text, integer, numeric, text
) to service_role;

create extension if not exists pg_cron with schema pg_catalog;

select cron.schedule(
  'queue-due-device-settlements',
  '* * * * *',
  'select public.queue_due_device_settlements();'
);

;
