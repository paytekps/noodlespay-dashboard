create table if not exists public.inquiries (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  inquiry_type text not null check (inquiry_type in ('contact', 'order_request')),
  status text not null default 'new' check (status in ('new', 'contacted', 'qualified', 'closed')),
  full_name text not null check (char_length(full_name) between 1 and 120),
  email text not null check (char_length(email) between 3 and 254),
  phone text,
  organization text,
  plan text check (plan is null or plan in ('basic', 'pro', 'premium')),
  quantity integer check (quantity is null or quantity between 1 and 100),
  message text,
  shipping_address text,
  shipping_city text,
  shipping_state text,
  shipping_postal_code text,
  shipping_country text,
  source text not null default 'website',
  admin_notes text,
  checkout_token uuid not null default gen_random_uuid(),
  stripe_checkout_session_id text,
  payment_status text not null default 'not_started' check (payment_status in ('not_started', 'checkout_created', 'paid', 'failed', 'refunded'))
);

alter table public.inquiries enable row level security;
revoke all on table public.inquiries from anon, authenticated;
grant all on table public.inquiries to service_role;
create index if not exists inquiries_created_at_idx on public.inquiries (created_at desc);
create index if not exists inquiries_status_idx on public.inquiries (status, created_at desc);
create unique index if not exists inquiries_checkout_token_unique on public.inquiries (checkout_token);;
