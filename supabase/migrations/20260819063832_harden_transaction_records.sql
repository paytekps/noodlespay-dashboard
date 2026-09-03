update public.transactions
set transaction_data = jsonb_strip_nulls(
  jsonb_build_object(
    'applicationVersion', transaction_data -> 'applicationVersion',
    'fwVersion', transaction_data -> 'fwVersion',
    'resultCode', transaction_data -> 'resultCode',
    'transactionType', transaction_data -> 'transactionType',
    'taxAmount', transaction_data -> 'taxAmount',
    'customTaxOneAmount', transaction_data -> 'customTaxOneAmount',
    'customTaxTwoAmount', transaction_data -> 'customTaxTwoAmount',
    'totalAmount', transaction_data -> 'totalAmount'
  )
)
where transaction_data is not null;

create unique index if not exists transactions_device_transaction_id_unique
  on public.transactions (device_id, transaction_id)
  where transaction_id is not null and transaction_id <> '';

alter table public.transactions
  add constraint transactions_status_allowed
    check (status in ('approved', 'declined')),
  add constraint transactions_last4_format
    check (last4 is null or last4 ~ '^[0-9]{1,4}$'),
  add constraint transactions_card_bin_format
    check (card_bin is null or card_bin ~ '^[0-9]{6,8}$');;
