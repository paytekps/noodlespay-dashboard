create table if not exists public.map_usage_monthly (
  month_start date primary key,
  request_count bigint not null default 0 check (request_count >= 0),
  updated_at timestamptz not null default now()
);

alter table public.map_usage_monthly enable row level security;

revoke all on table public.map_usage_monthly from public, anon, authenticated;
grant select, insert, update on table public.map_usage_monthly to service_role;

create or replace function public.claim_map_request(p_limit integer)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_allowed boolean := false;
  v_month_start date := date_trunc('month', timezone('UTC', now()))::date;
begin
  if p_limit < 1 or p_limit > 50000 then
    return false;
  end if;

  insert into public.map_usage_monthly (month_start, request_count, updated_at)
  values (v_month_start, 1, now())
  on conflict (month_start) do update
    set request_count = public.map_usage_monthly.request_count + 1,
        updated_at = now()
    where public.map_usage_monthly.request_count < p_limit
  returning true into v_allowed;

  return coalesce(v_allowed, false);
end;
$$;

revoke all on function public.claim_map_request(integer) from public, anon, authenticated;
grant execute on function public.claim_map_request(integer) to service_role;
