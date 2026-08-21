create index if not exists devices_location_refresh_requested_by_idx
  on public.devices (location_refresh_requested_by);
