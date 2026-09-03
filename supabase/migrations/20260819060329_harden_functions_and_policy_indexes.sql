
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  insert into public.profiles (id, role)
  values (new.id, 'merchant');
  return new;
end
$$;
revoke all on function public.handle_new_user() from public, anon, authenticated;

create index if not exists devices_merchant_id_idx on public.devices (merchant_id);
create index if not exists sales_rep_merchants_merchant_id_idx on public.sales_rep_merchants (merchant_id);
create index if not exists sales_rep_merchants_sales_rep_id_idx on public.sales_rep_merchants (sales_rep_id);
create index if not exists transactions_device_id_idx on public.transactions (device_id);
create index if not exists transactions_merchant_id_idx on public.transactions (merchant_id);
;
