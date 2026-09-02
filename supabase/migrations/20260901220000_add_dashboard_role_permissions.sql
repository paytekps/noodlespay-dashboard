create table if not exists public.dashboard_role_permissions (
  role text not null check (role in ('admin', 'sales_rep', 'merchant')),
  permission_key text not null,
  allowed boolean not null,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (role, permission_key)
);

alter table public.dashboard_role_permissions enable row level security;
revoke all on table public.dashboard_role_permissions from anon, authenticated;

insert into public.dashboard_role_permissions(role, permission_key, allowed)
values
  ('admin','overview.view',true),('admin','devices.view',true),('admin','devices.configure',true),('admin','devices.enroll',true),
  ('admin','plans.view',true),('admin','plans.select',true),('admin','features.assign',true),('admin','catalog.pricing.manage',false),
  ('admin','transactions.view',true),('admin','transactions.actions',true),('admin','batches.view',true),('admin','batches.manage',true),
  ('admin','reports.view',true),('admin','integrations.view',true),('admin','integrations.manage',true),('admin','processor.view',true),
  ('admin','processor.manage',true),('admin','users.manage',true),('admin','sales.manage',true),('admin','audit.view',true),('admin','permissions.manage',false),
  ('sales_rep','overview.view',true),('sales_rep','devices.view',true),('sales_rep','devices.configure',false),('sales_rep','devices.enroll',false),
  ('sales_rep','plans.view',true),('sales_rep','plans.select',false),('sales_rep','features.assign',false),('sales_rep','catalog.pricing.manage',false),
  ('sales_rep','transactions.view',true),('sales_rep','transactions.actions',false),('sales_rep','batches.view',true),('sales_rep','batches.manage',false),
  ('sales_rep','reports.view',true),('sales_rep','integrations.view',true),('sales_rep','integrations.manage',false),('sales_rep','processor.view',true),
  ('sales_rep','processor.manage',false),('sales_rep','users.manage',false),('sales_rep','sales.manage',false),('sales_rep','audit.view',true),('sales_rep','permissions.manage',false),
  ('merchant','overview.view',true),('merchant','devices.view',true),('merchant','devices.configure',true),('merchant','devices.enroll',false),
  ('merchant','plans.view',true),('merchant','plans.select',true),('merchant','features.assign',true),('merchant','catalog.pricing.manage',false),
  ('merchant','transactions.view',true),('merchant','transactions.actions',true),('merchant','batches.view',true),('merchant','batches.manage',true),
  ('merchant','reports.view',true),('merchant','integrations.view',true),('merchant','integrations.manage',false),('merchant','processor.view',true),
  ('merchant','processor.manage',false),('merchant','users.manage',false),('merchant','sales.manage',false),('merchant','audit.view',true),('merchant','permissions.manage',false)
on conflict (role, permission_key) do nothing;
