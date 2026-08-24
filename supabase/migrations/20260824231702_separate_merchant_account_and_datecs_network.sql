alter table public.inquiries
  add column merchant_account_preference text;

alter table public.inquiries
  drop constraint inquiries_processor_preference_check;

alter table public.inquiries
  add constraint inquiries_merchant_account_preference_check
  check (
    merchant_account_preference is null
    or merchant_account_preference = any (
      array[
        'existing_account'::text,
        'need_merchant_account'::text
      ]
    )
  ),
  add constraint inquiries_processor_preference_check
  check (
    processor_preference is null
    or processor_preference = any (
      array[
        'fiserv_rapid_connect'::text,
        'tsys_sierra'::text
      ]
    )
  ),
  add constraint inquiries_order_processing_details_check
  check (
    inquiry_type <> 'order_request'
    or (
      merchant_account_preference is not null
      and processor_preference is not null
    )
  );

comment on column public.inquiries.merchant_account_preference is
  'Whether the prospective merchant will use an existing merchant account or needs help obtaining one.';

comment on column public.inquiries.processor_preference is
  'Datecs processing network selected for the BlueCash-05: Fiserv Rapid Connect or TSYS / Global Payments Sierra.';
