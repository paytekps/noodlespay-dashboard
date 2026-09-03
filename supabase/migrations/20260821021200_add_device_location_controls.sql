alter table public.devices
  add column if not exists location_service_enabled boolean,
  add column if not exists location_refresh_requested_at timestamptz,
  add column if not exists location_refresh_requested_by uuid references auth.users(id) on delete set null,
  add column if not exists location_refresh_status text
    check (
      location_refresh_status is null
      or location_refresh_status in (
        'pending',
        'enabled',
        'permission_required',
        'settings_required',
        'error'
      )
    ),
  add column if not exists location_refresh_status_updated_at timestamptz;

grant update (
  location_service_enabled,
  location_refresh_requested_at,
  location_refresh_requested_by,
  location_refresh_status,
  location_refresh_status_updated_at
) on table public.devices to service_role;;
