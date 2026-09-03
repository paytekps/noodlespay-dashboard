
create table public.device_config_history (
  id bigint generated always as identity primary key,
  device_config_id uuid not null,
  device_id uuid not null references public.devices(id) on delete cascade,
  merchant_id uuid not null references public.merchants(id) on delete cascade,
  changed_at timestamptz not null default now(),
  changed_by uuid,
  changed_by_role text not null,
  action text not null check (action in ('baseline', 'created', 'updated')),
  changes jsonb not null default '{}'::jsonb,
  previous_config jsonb,
  new_config jsonb
);

alter table public.device_config_history enable row level security;

create index device_config_history_device_changed_idx
  on public.device_config_history (device_id, changed_at desc);
create index device_config_history_merchant_changed_idx
  on public.device_config_history (merchant_id, changed_at desc);

create policy device_config_history_select_authorized
on public.device_config_history
for select
to authenticated
using ((select private.can_access_merchant(merchant_id)));

revoke all on table public.device_config_history from public, anon, authenticated;
grant select on table public.device_config_history to authenticated;
revoke all on sequence public.device_config_history_id_seq from public, anon, authenticated;

create or replace function private.record_device_config_history()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  actor_role text := coalesce(private.current_profile_role(), 'system');
  target_merchant_id uuid;
  old_config jsonb;
  current_config jsonb;
  changed_fields jsonb;
begin
  if tg_table_schema <> 'public' or tg_table_name <> 'device_config' then
    raise exception 'Invalid audit trigger source';
  end if;

  select d.merchant_id into target_merchant_id
  from public.devices d
  where d.id = new.device_id;

  if target_merchant_id is null then
    raise exception 'Cannot record device settings history without a merchant';
  end if;

  current_config := to_jsonb(new) - array['id', 'created_at', 'updated_at'];

  if tg_op = 'INSERT' then
    changed_fields := (
      select coalesce(
        jsonb_object_agg(entry.key, jsonb_build_object('before', null, 'after', entry.value)),
        '{}'::jsonb
      )
      from jsonb_each(current_config) entry
    );

    insert into public.device_config_history (
      device_config_id, device_id, merchant_id, changed_by, changed_by_role,
      action, changes, previous_config, new_config
    ) values (
      new.id, new.device_id, target_merchant_id, actor_id, actor_role,
      'created', changed_fields, null, current_config
    );
  else
    old_config := to_jsonb(old) - array['id', 'created_at', 'updated_at'];

    changed_fields := (
      select coalesce(
        jsonb_object_agg(
          current_entry.key,
          jsonb_build_object(
            'before', old_config -> current_entry.key,
            'after', current_entry.value
          )
        ),
        '{}'::jsonb
      )
      from jsonb_each(current_config) current_entry
      where old_config -> current_entry.key is distinct from current_entry.value
    );

    if changed_fields <> '{}'::jsonb then
      insert into public.device_config_history (
        device_config_id, device_id, merchant_id, changed_by, changed_by_role,
        action, changes, previous_config, new_config
      ) values (
        new.id, new.device_id, target_merchant_id, actor_id, actor_role,
        'updated', changed_fields, old_config, current_config
      );
    end if;
  end if;

  return new;
end
$$;

revoke all on function private.record_device_config_history() from public, anon, authenticated;

drop trigger if exists record_device_config_history on public.device_config;
create trigger record_device_config_history
after insert or update on public.device_config
for each row execute function private.record_device_config_history();

insert into public.device_config_history (
  device_config_id, device_id, merchant_id, changed_by, changed_by_role,
  action, changes, previous_config, new_config, changed_at
)
select
  c.id,
  c.device_id,
  d.merchant_id,
  null,
  'system',
  'baseline',
  '{}'::jsonb,
  null,
  to_jsonb(c) - array['id', 'created_at', 'updated_at'],
  now()
from public.device_config c
join public.devices d on d.id = c.device_id;
;
