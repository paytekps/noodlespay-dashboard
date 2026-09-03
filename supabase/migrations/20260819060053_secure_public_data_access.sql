
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

create or replace function private.current_profile_role()
returns text language sql stable security definer set search_path = ''
as $$ select p.role from public.profiles p where p.id = (select auth.uid()) limit 1 $$;

create or replace function private.is_admin()
returns boolean language sql stable security definer set search_path = ''
as $$ select coalesce(private.current_profile_role() in ('admin', 'super_admin'), false) $$;

create or replace function private.can_access_merchant(target_merchant_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select (select auth.uid()) is not null and exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and (
        p.role in ('admin', 'super_admin')
        or p.merchant_id = target_merchant_id
        or (
          p.role = 'sales_rep' and exists (
            select 1
            from public.sales_reps sr
            join public.sales_rep_merchants srm on srm.sales_rep_id = sr.id
            where sr.user_id = p.id and srm.merchant_id = target_merchant_id
          )
        )
      )
  )
$$;

revoke all on function private.current_profile_role() from public;
revoke all on function private.is_admin() from public;
revoke all on function private.can_access_merchant(uuid) from public;
grant execute on function private.current_profile_role() to authenticated;
grant execute on function private.is_admin() to authenticated;
grant execute on function private.can_access_merchant(uuid) to authenticated;

create or replace function private.protect_device_config_fields()
returns trigger language plpgsql security invoker set search_path = ''
as $$
declare caller_role text := coalesce(private.current_profile_role(), '');
begin
  if current_user = 'service_role' or caller_role in ('admin', 'super_admin') then return new; end if;
  if tg_op = 'INSERT' then
    if coalesce(new.plan, 'basic') <> 'basic'
      or coalesce(new.allow_increase, false)
      or coalesce(new.allow_reset, false)
      or coalesce(new.allow_qr, false)
      or coalesce(new.allow_amount_change, false)
      or coalesce(new.merchant_can_edit, false) then
      raise exception 'Only an administrator can set protected device fields';
    end if;
  elsif new.device_id is distinct from old.device_id
    or new.plan is distinct from old.plan
    or new.org_name is distinct from old.org_name
    or new.allow_increase is distinct from old.allow_increase
    or new.allow_reset is distinct from old.allow_reset
    or new.allow_qr is distinct from old.allow_qr
    or new.allow_amount_change is distinct from old.allow_amount_change
    or new.merchant_can_edit is distinct from old.merchant_can_edit then
    raise exception 'Only an administrator can change protected device fields';
  end if;
  return new;
end $$;

drop trigger if exists protect_device_config_fields on public.device_config;
create trigger protect_device_config_fields before insert or update on public.device_config
for each row execute function private.protect_device_config_fields();

drop policy if exists "READ" on public.device_config;
drop policy if exists "WRITE" on public.device_config;
drop policy if exists "Name: allow all devices" on public.devices;
drop policy if exists "allow insert devices" on public.devices;
drop policy if exists "GRANT SELECT ON merchants TO anon;" on public.merchants;
drop policy if exists "allow read merchants" on public.merchants;
drop policy if exists "Allow insert for new users" on public.profiles;
drop policy if exists "Allow insert for system" on public.profiles;
drop policy if exists "Allow read profiles" on public.profiles;
drop policy if exists "Admins can view all transactions" on public.transactions;
drop policy if exists "Users can view their own transactions" on public.transactions;

alter table public.profiles enable row level security;
alter table public.merchants enable row level security;
alter table public.devices enable row level security;
alter table public.device_config enable row level security;
alter table public.features enable row level security;
alter table public.merchant_features enable row level security;
alter table public.sales_reps enable row level security;
alter table public.sales_rep_merchants enable row level security;
alter table public.transactions enable row level security;

create policy profiles_select_authorized on public.profiles for select to authenticated
using (id = (select auth.uid()) or (select private.is_admin()));
create policy merchants_select_authorized on public.merchants for select to authenticated
using ((select private.can_access_merchant(id)));
create policy merchants_insert_admin on public.merchants for insert to authenticated
with check ((select private.is_admin()));
create policy devices_select_authorized on public.devices for select to authenticated
using ((select private.can_access_merchant(merchant_id)));
create policy devices_insert_admin on public.devices for insert to authenticated
with check ((select private.is_admin()));
create policy device_config_select_authorized on public.device_config for select to authenticated
using (exists (select 1 from public.devices d where d.id = device_config.device_id and (select private.can_access_merchant(d.merchant_id))));
create policy device_config_insert_authorized on public.device_config for insert to authenticated
with check (exists (select 1 from public.devices d where d.id = device_config.device_id and (select private.can_access_merchant(d.merchant_id))));
create policy device_config_update_authorized on public.device_config for update to authenticated
using (exists (select 1 from public.devices d where d.id = device_config.device_id and (select private.can_access_merchant(d.merchant_id))))
with check (exists (select 1 from public.devices d where d.id = device_config.device_id and (select private.can_access_merchant(d.merchant_id))));
create policy features_select_authenticated on public.features for select to authenticated using (true);
create policy merchant_features_select_authorized on public.merchant_features for select to authenticated
using ((select private.can_access_merchant(merchant_id)));
create policy merchant_features_update_admin on public.merchant_features for update to authenticated
using ((select private.is_admin())) with check ((select private.is_admin()));
create policy sales_reps_select_authorized on public.sales_reps for select to authenticated
using (user_id = (select auth.uid()) or (select private.is_admin()));
create policy sales_rep_merchants_select_authorized on public.sales_rep_merchants for select to authenticated
using ((select private.is_admin()) or exists (select 1 from public.sales_reps sr where sr.id = sales_rep_merchants.sales_rep_id and sr.user_id = (select auth.uid())));
create policy transactions_select_authorized on public.transactions for select to authenticated
using ((select private.can_access_merchant(merchant_id)));

revoke all on table public.profiles, public.merchants, public.devices, public.device_config,
public.features, public.merchant_features, public.sales_reps, public.sales_rep_merchants,
public.transactions from anon, authenticated;

grant select on table public.profiles to authenticated;
grant select, insert on table public.merchants to authenticated;
grant select, insert on table public.devices to authenticated;
grant select, insert, update on table public.device_config to authenticated;
grant select on table public.features to authenticated;
grant select, update on table public.merchant_features to authenticated;
grant select on table public.sales_reps to authenticated;
grant select on table public.sales_rep_merchants to authenticated;
grant select on table public.transactions to authenticated;

revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.rls_auto_enable() from public, anon, authenticated;
revoke all on function public.get_device_bootstrap(text) from public, authenticated;
grant execute on function public.get_device_bootstrap(text) to anon;

alter default privileges for role postgres in schema public
  revoke select, insert, update, delete, truncate, references, trigger on tables from anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  revoke usage, select, update on sequences from anon, authenticated, service_role;
;
