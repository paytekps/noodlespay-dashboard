create policy inquiries_deny_direct_access
on public.inquiries
as restrictive
for all
to anon, authenticated
using (false)
with check (false);;
