create table public.closed_loop_cards (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants(id) on delete cascade,
  slot smallint not null check (slot between 1 and 4),
  name text not null check (char_length(btrim(name)) between 1 and 80),
  bin_prefix text check (bin_prefix is null or bin_prefix ~ '^[0-9]{6,8}$'),
  enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (merchant_id, slot)
);

create unique index closed_loop_cards_merchant_bin_unique
  on public.closed_loop_cards (merchant_id, bin_prefix)
  where bin_prefix is not null;

alter table public.closed_loop_cards enable row level security;

create policy closed_loop_cards_select_authorized
  on public.closed_loop_cards for select to authenticated
  using ((select private.can_access_merchant(merchant_id)));

create policy closed_loop_cards_insert_admin
  on public.closed_loop_cards for insert to authenticated
  with check ((select private.is_admin()));

create policy closed_loop_cards_update_admin
  on public.closed_loop_cards for update to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

create policy closed_loop_cards_delete_admin
  on public.closed_loop_cards for delete to authenticated
  using ((select private.is_admin()));

revoke all on table public.closed_loop_cards from anon;
grant select, insert, update, delete on table public.closed_loop_cards to authenticated;

create or replace function private.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger closed_loop_cards_set_updated_at
before update on public.closed_loop_cards
for each row execute function private.set_updated_at();;
