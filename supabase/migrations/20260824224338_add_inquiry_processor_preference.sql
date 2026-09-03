alter table public.inquiries
  add column processor_preference text,
  add column current_processor_name text;

alter table public.inquiries
  add constraint inquiries_processor_preference_check
  check (
    processor_preference is null
    or processor_preference = any (
      array[
        'existing_account'::text,
        'fiserv_rapid_connect'::text,
        'stripe_terminal'::text,
        'help_me_choose'::text
      ]
    )
  ),
  add constraint inquiries_current_processor_name_check
  check (
    current_processor_name is null
    or char_length(current_processor_name) between 1 and 120
  );

comment on column public.inquiries.processor_preference is
  'Merchant card-processing preference captured during a device order request. Compatibility must be confirmed before activation.';

comment on column public.inquiries.current_processor_name is
  'Optional processor or platform name supplied by the merchant during a device order request.';;
