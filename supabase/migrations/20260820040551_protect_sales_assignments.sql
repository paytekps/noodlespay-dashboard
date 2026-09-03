create unique index if not exists sales_reps_user_id_unique
  on public.sales_reps (user_id)
  where user_id is not null;

create unique index if not exists sales_rep_merchants_pair_unique
  on public.sales_rep_merchants (sales_rep_id, merchant_id)
  where sales_rep_id is not null and merchant_id is not null;;
