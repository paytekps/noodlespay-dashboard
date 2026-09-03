-- User management is performed only by authenticated Owner API routes.
-- Keep browser-role RLS and grants unchanged; restore only the server role's
-- explicit Data API privileges after public-schema default grants were revoked.
grant select, insert, update, delete on table public.profiles to service_role;
grant select, insert, update, delete on table public.sales_rep_merchants to service_role;
