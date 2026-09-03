alter table public.device_config
  add column enable_reset boolean not null default false;

create or replace function private.enforce_device_plan_features()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.plan = 'basic' then
    new.enable_presets := false;
    new.enable_increment := false;
    new.enable_reset := false;
    new.reset_mode := 'none';
  elsif new.plan = 'pro' then
    new.enable_presets := false;
    new.enable_reset := coalesce(new.enable_reset, false)
      and coalesce(new.allow_reset, false);
    new.reset_mode := 'button';
  elsif new.plan = 'premium' then
    new.enable_reset := coalesce(new.enable_reset, false)
      and coalesce(new.allow_reset, false);
  end if;
  return new;
end;
$$;

create trigger enforce_device_plan_features
before insert or update on public.device_config
for each row execute function private.enforce_device_plan_features();

update public.device_config
set
  enable_reset = case
    when plan in ('pro', 'premium') then coalesce(allow_reset, false)
    else false
  end,
  enable_presets = case when plan = 'premium' then enable_presets else false end,
  enable_increment = case when plan in ('pro', 'premium') then enable_increment else false end,
  reset_mode = case
    when plan = 'basic' then 'none'
    when plan = 'pro' then 'button'
    else reset_mode
  end;

alter table public.device_config
  add constraint device_config_plan_allowed
  check (plan in ('basic', 'pro', 'premium'));

create or replace function public.get_device_bootstrap(p_serial_number text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'device_id', d.id,
    'merchant_id', d.merchant_id,
    'merchant_name', coalesce(m.name, 'Merchant'),
    'plan', coalesce(c.plan, 'basic'),
    'display_text', coalesce(c.display_text, ''),
    'enable_presets', coalesce(c.enable_presets, false),
    'enable_increment', coalesce(c.enable_increment, false),
    'enable_reset', coalesce(c.enable_reset, false),
    'default_amount', coalesce(c.default_amount, 0),
    'step_amount', coalesce(c.step_amount, 5),
    'max_amount', coalesce(c.max_amount, 100),
    'preset_1', coalesce(c.preset_1, 5),
    'preset_2', coalesce(c.preset_2, 10),
    'preset_3', coalesce(c.preset_3, 20),
    'reset_mode', coalesce(c.reset_mode, 'none'),
    'reset_delay', coalesce(c.reset_delay, 5)
  )
  from public.devices d
  left join public.merchants m on m.id = d.merchant_id
  left join public.device_config c on c.device_id = d.id
  where d.serial_number = p_serial_number
  limit 1
$$;;
