alter table public.devices
  add column if not exists location_latitude double precision
    check (location_latitude between -90 and 90),
  add column if not exists location_longitude double precision
    check (location_longitude between -180 and 180),
  add column if not exists location_accuracy_m double precision
    check (location_accuracy_m between 0 and 100000),
  add column if not exists location_provider text
    check (location_provider is null or char_length(location_provider) between 1 and 30),
  add column if not exists location_updated_at timestamptz,
  add column if not exists location_permission_granted boolean,
  add column if not exists app_version text
    check (app_version is null or char_length(app_version) between 1 and 60);

grant update (
  last_seen_at,
  location_latitude,
  location_longitude,
  location_accuracy_m,
  location_provider,
  location_updated_at,
  location_permission_granted,
  app_version
) on table public.devices to service_role;;
