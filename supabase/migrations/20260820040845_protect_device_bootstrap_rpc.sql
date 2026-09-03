revoke execute on function public.get_device_bootstrap(text) from public;
revoke execute on function public.get_device_bootstrap(text) from anon;
revoke execute on function public.get_device_bootstrap(text) from authenticated;
grant execute on function public.get_device_bootstrap(text) to service_role;;
