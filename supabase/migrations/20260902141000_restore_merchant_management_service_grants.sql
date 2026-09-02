-- Merchant management runs only through authenticated dashboard API routes.
-- RLS remains enabled for browser roles; restore the DML privileges required by
-- Supabase's server-only service_role so those routes can perform their work.
grant select, insert, update, delete on table public.merchants to service_role;
grant select, insert, update, delete on table public.sales_reps to service_role;

