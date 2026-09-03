alter table public.inquiries
  drop constraint inquiries_processor_preference_check;

alter table public.inquiries
  add constraint inquiries_processor_preference_check
  check (
    processor_preference is null
    or processor_preference = any (
      array[
        'existing_account'::text,
        'fiserv_rapid_connect'::text,
        'tsys_sierra'::text,
        'stripe_terminal'::text,
        'help_me_choose'::text
      ]
    )
  );;
