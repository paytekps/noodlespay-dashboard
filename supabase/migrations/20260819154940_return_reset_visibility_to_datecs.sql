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
    'allow_reset', coalesce(c.allow_reset, false),
    'default_amount', coalesce(c.default_amount, 0),
    'step_amount', coalesce(c.step_amount, 5),
    'max_amount', coalesce(c.max_amount, 100),
    'preset_1', coalesce(c.preset_1, 5),
    'preset_2', coalesce(c.preset_2, 10),
    'preset_3', coalesce(c.preset_3, 20),
    'reset_mode', coalesce(c.reset_mode, 'button'),
    'reset_delay', coalesce(c.reset_delay, 5)
  )
  from public.devices d
  left join public.merchants m on m.id = d.merchant_id
  left join public.device_config c on c.device_id = d.id
  where d.serial_number = p_serial_number
  limit 1
$$;;
