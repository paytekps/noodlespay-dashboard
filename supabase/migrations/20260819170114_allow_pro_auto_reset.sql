create or replace function private.enforce_device_plan_features()
returns trigger
language plpgsql
set search_path = ''
as $function$
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
    if not new.enable_reset then
      new.reset_mode := 'none';
    elsif new.reset_mode not in ('button', 'auto') then
      new.reset_mode := 'button';
    end if;
  elsif new.plan = 'premium' then
    new.enable_reset := coalesce(new.enable_reset, false)
      and coalesce(new.allow_reset, false);
    if not new.enable_reset then
      new.reset_mode := 'none';
    elsif new.reset_mode not in ('button', 'auto') then
      new.reset_mode := 'button';
    end if;
  end if;
  return new;
end;
$function$;;
