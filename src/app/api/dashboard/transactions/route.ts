import { NextResponse } from 'next/server';
import { dashboardRequestContext, hasDashboardPermission } from '../../../../lib/dashboard-request';

export const dynamic = 'force-dynamic';

function json(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'private, no-store, max-age=0' }
  });
}

export async function GET(req: Request) {
  const context = await dashboardRequestContext(req);
  if ('error' in context) return json({ error: context.error }, context.status);
  if (!hasDashboardPermission(context, 'transactions.view')) {
    return json({ error: 'You do not have permission to view transactions.' }, 403);
  }
  if (context.merchantIds?.length === 0) {
    return json({ role: context.role, transactions: [] });
  }

  const terminal = context.admin.schema('gimml_terminal');
  let transactionQuery = terminal
    .from('dashboard_transactions')
    .select('transaction_id, merchant_id, device_id, serial_number, amount_minor, currency, status, processor_reference, last4, authorization_code, reference_number, batch_id, trace_number, card_issuer, account_type, entry_method, payment_program, result_code, transaction_type, card_type, host_message, base_amount_minor, tip_amount_minor, fee_amount_minor, cashback_amount_minor, processed_amount_minor, closed_loop_program, occurred_at, received_at')
    .order('occurred_at', { ascending: false })
    .limit(1000);
  let merchantQuery = terminal.from('merchants').select('id, display_name');

  if (context.merchantIds !== null) {
    transactionQuery = transactionQuery.in('merchant_id', context.merchantIds);
    merchantQuery = merchantQuery.in('id', context.merchantIds);
  }

  const [transactionsResult, merchantsResult] = await Promise.all([
    transactionQuery,
    merchantQuery
  ]);
  const error = transactionsResult.error || merchantsResult.error;
  if (error) {
    console.error('[dashboard/transactions] unified lookup failed', error);
    return json({ error: 'Transactions could not be loaded.' }, 500);
  }

  const merchantNames = new Map(
    (merchantsResult.data ?? []).map(merchant => [merchant.id, merchant.display_name])
  );
  const transactions = (transactionsResult.data ?? []).map(transaction => ({
    id: transaction.transaction_id,
    transaction_id: transaction.transaction_id,
    created_at: transaction.occurred_at,
    received_at: transaction.received_at,
    device_id: transaction.device_id,
    merchant_id: transaction.merchant_id,
    amount: Number(transaction.amount_minor ?? 0) / 100,
    currency: transaction.currency,
    status: transaction.status,
    payment_method: transaction.card_type,
    authorization_source: null,
    authorization_code: transaction.authorization_code,
    reference_number: transaction.reference_number ?? transaction.processor_reference,
    batch_id: transaction.batch_id,
    trace_no: transaction.trace_number,
    card_issuer: transaction.card_issuer ?? transaction.card_type,
    card_bin: null,
    last4: transaction.last4,
    account_type: transaction.account_type,
    card_entry_method: transaction.entry_method,
    payment_program: transaction.closed_loop_program ?? transaction.payment_program,
    host_message: transaction.host_message,
    base_amount: transaction.base_amount_minor == null ? null : Number(transaction.base_amount_minor) / 100,
    tip_amount: transaction.tip_amount_minor == null ? null : Number(transaction.tip_amount_minor) / 100,
    fee_amount: transaction.fee_amount_minor == null ? null : Number(transaction.fee_amount_minor) / 100,
    cashback_amount: transaction.cashback_amount_minor == null ? null : Number(transaction.cashback_amount_minor) / 100,
    processed_amount: transaction.processed_amount_minor == null ? null : Number(transaction.processed_amount_minor) / 100,
    transaction_type: transaction.transaction_type,
    devices: { name: transaction.serial_number },
    merchants: { name: merchantNames.get(transaction.merchant_id) ?? 'Unknown merchant' }
  }));

  return json({ role: context.role, transactions });
}
