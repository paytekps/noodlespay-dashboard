begin;

alter table gimml_terminal.merchant_entitlements
  add column if not exists external_subscription_id text,
  add column if not exists external_subscription_item_id text;

create unique index if not exists merchant_entitlements_external_subscription_item
  on gimml_terminal.merchant_entitlements(external_subscription_item_id)
  where external_subscription_item_id is not null;

create table if not exists gimml_terminal.feature_checkout_requests(
  id uuid primary key,
  merchant_id uuid not null references gimml_terminal.merchants(id),
  device_id uuid not null references gimml_terminal.devices(id),
  sku text not null references gimml_terminal.catalog_items(sku),
  capability_key text not null references gimml_terminal.capabilities(key),
  requested_by uuid not null,
  unit_price_cents bigint not null check(unit_price_cents > 0),
  billing_interval text not null check(billing_interval in ('monthly','annual')),
  stripe_session_id text unique,
  status text not null check(status in ('created','checkout_created','paid','failed','cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists feature_checkout_requests_merchant_created
  on gimml_terminal.feature_checkout_requests(merchant_id,created_at desc);

alter table gimml_terminal.feature_checkout_requests enable row level security;
revoke all on gimml_terminal.feature_checkout_requests from public,anon,authenticated;
grant select,insert,update,delete on gimml_terminal.feature_checkout_requests to service_role;

commit;
