create table if not exists public.device_command_credentials (
  device_id uuid primary key references public.devices(id) on delete cascade,
  token_hash text not null check (token_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  rotated_at timestamptz not null default now(),
  disabled_at timestamptz
);

alter table public.device_command_credentials enable row level security;
revoke all on table public.device_command_credentials from public, anon, authenticated;
grant select, insert, update, delete on table public.device_command_credentials to service_role;

create table if not exists public.transaction_actions (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.transactions(id) on delete restrict,
  device_id uuid not null references public.devices(id) on delete restrict,
  merchant_id uuid not null references public.merchants(id) on delete restrict,
  action_type text not null check (action_type in ('void', 'refund')),
  amount numeric(12, 2) not null check (amount > 0),
  status text not null default 'queued'
    check (status in ('queued', 'processing', 'succeeded', 'failed', 'cancelled', 'expired')),
  requested_by uuid not null references public.profiles(id) on delete restrict,
  requested_at timestamptz not null default now(),
  processing_started_at timestamptz,
  completed_at timestamptz,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  device_message text,
  processor_reference text
);

create index if not exists transaction_actions_device_queue_idx
  on public.transaction_actions (device_id, requested_at)
  where status = 'queued';

create index if not exists transaction_actions_transaction_id_idx
  on public.transaction_actions (transaction_id, requested_at desc);

create index if not exists transaction_actions_merchant_id_idx
  on public.transaction_actions (merchant_id, requested_at desc);

create index if not exists transaction_actions_requested_by_idx
  on public.transaction_actions (requested_by);

create unique index if not exists transaction_actions_one_active_per_transaction
  on public.transaction_actions (transaction_id)
  where status in ('queued', 'processing');

create unique index if not exists transaction_actions_one_success_per_type
  on public.transaction_actions (transaction_id, action_type)
  where status = 'succeeded';

alter table public.transaction_actions enable row level security;
revoke all on table public.transaction_actions from public, anon, authenticated;
grant select, insert, update, delete on table public.transaction_actions to service_role;

create or replace function public.claim_device_transaction_action(p_device_id uuid)
returns setof public.transaction_actions
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.transaction_actions action
  set status = case when action.attempt_count >= 3 then 'failed' else 'queued' end,
      processing_started_at = null,
      completed_at = case when action.attempt_count >= 3 then now() else null end,
      device_message = case
        when action.attempt_count >= 3 then 'Device did not finish the request after three attempts.'
        else action.device_message
      end
  where action.device_id = p_device_id
    and action.status = 'processing'
    and action.processing_started_at < now() - interval '5 minutes';

  return query
  with next_action as (
    select queued.id
    from public.transaction_actions queued
    where queued.device_id = p_device_id
      and queued.status = 'queued'
    order by queued.requested_at
    for update skip locked
    limit 1
  )
  update public.transaction_actions action
  set status = 'processing',
      processing_started_at = now(),
      attempt_count = action.attempt_count + 1
  from next_action
  where action.id = next_action.id
  returning action.*;
end;
$$;

revoke all on function public.claim_device_transaction_action(uuid) from public, anon, authenticated;
grant execute on function public.claim_device_transaction_action(uuid) to service_role;

create or replace function public.complete_device_transaction_action(
  p_device_id uuid,
  p_action_id uuid,
  p_success boolean,
  p_message text,
  p_processor_reference text
)
returns setof public.transaction_actions
language plpgsql
security definer
set search_path = ''
as $$
declare
  completed_action public.transaction_actions;
begin
  update public.transaction_actions action
  set status = case when p_success then 'succeeded' else 'failed' end,
      completed_at = now(),
      device_message = nullif(left(coalesce(p_message, ''), 500), ''),
      processor_reference = nullif(left(coalesce(p_processor_reference, ''), 120), '')
  where action.id = p_action_id
    and action.device_id = p_device_id
    and action.status = 'processing'
  returning action.* into completed_action;

  if completed_action.id is null then
    return;
  end if;

  if p_success then
    update public.transactions transaction
    set status = case
      when completed_action.action_type = 'void' then 'voided'
      else 'refunded'
    end
    where transaction.id = completed_action.transaction_id;
  end if;

  return next completed_action;
end;
$$;

revoke all on function public.complete_device_transaction_action(uuid, uuid, boolean, text, text)
  from public, anon, authenticated;
grant execute on function public.complete_device_transaction_action(uuid, uuid, boolean, text, text)
  to service_role;

grant update (last_seen_at) on table public.devices to service_role;

alter table public.transactions drop constraint if exists transactions_status_check;
alter table public.transactions
  add constraint transactions_status_check
  check (status in ('approved', 'declined', 'voided', 'refunded'));

;
