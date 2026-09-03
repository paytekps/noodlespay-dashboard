import { NextResponse } from 'next/server';
import { canAccessMerchant, dashboardRequestContext, hasDashboardPermission } from '../../../../lib/dashboard-request';

const transactionIdPattern = /^[A-Za-z0-9_.:-]{1,128}$/;

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store, max-age=0' } });
}

function transactionIdsFrom(req: Request) {
  const values = new URL(req.url).searchParams.get('transaction_ids')?.split(',') ?? [];
  return [...new Set(values.map(value => value.trim()).filter(value => transactionIdPattern.test(value)))].slice(0, 200);
}

export async function GET(req: Request) {
  const context = await dashboardRequestContext(req);
  if ('error' in context) return json({ error: context.error }, context.status);
  if (!hasDashboardPermission(context, 'transactions.view')) return json({ error: 'You do not have permission to view transaction actions.' }, 403);
  const transactionIds = transactionIdsFrom(req);
  if (!transactionIds.length || context.merchantIds?.length === 0) return json({ actions: [] });
  const terminal = context.admin.schema('gimml_terminal');
  let query = terminal.from('device_commands')
    .select('id, merchant_id, action, state, created_at, completed_at, outcome_message, processor_reference, processor_transaction_id')
    .eq('action', 'void').in('processor_transaction_id', transactionIds).order('created_at', { ascending: false });
  if (context.merchantIds !== null) query = query.in('merchant_id', context.merchantIds);
  const { data, error } = await query;
  if (error) {
    console.error('[transaction/actions] unified command lookup failed', error);
    return json({ error: 'Transaction actions could not be loaded.' }, 500);
  }
  return json({ actions: (data ?? []).map(command => ({
    id: command.id,
    transaction_id: command.processor_transaction_id,
    action_type: command.action,
    status: command.state,
    requested_at: command.created_at,
    completed_at: command.completed_at,
    device_message: command.outcome_message,
    processor_reference: command.processor_reference
  })) });
}

export async function POST(req: Request) {
  const context = await dashboardRequestContext(req);
  if ('error' in context) return json({ error: context.error }, context.status);
  if (!hasDashboardPermission(context, 'transactions.actions')) return json({ error: 'You do not have permission to void or refund transactions.' }, 403);
  const body = await req.json().catch(() => ({}));
  const transactionId = typeof body.transactionId === 'string' ? body.transactionId.trim() : '';
  const actionType = body.actionType === 'void' || body.actionType === 'refund' ? body.actionType : null;
  if (!transactionIdPattern.test(transactionId) || !actionType) return json({ error: 'Choose a valid transaction action.' }, 400);

  const terminal = context.admin.schema('gimml_terminal');
  const { data: transaction, error: transactionError } = await terminal.from('transactions')
    .select('id, device_id, merchant_id, amount_minor, status, processor_reference').eq('id', transactionId).maybeSingle();
  if (transactionError) {
    console.error('[transaction/actions] unified transaction lookup failed', transactionError);
    return json({ error: 'The transaction could not be checked.' }, 500);
  }
  if (!transaction || !canAccessMerchant(context, transaction.merchant_id)) return json({ error: 'Transaction not found.' }, 404);
  if (transaction.status !== 'approved') return json({ error: 'Only an approved transaction can be voided or refunded.' }, 400);

  const command = {
    id: crypto.randomUUID(),
    merchant_id: transaction.merchant_id,
    device_id: transaction.device_id,
    capability_key: actionType === 'void' ? 'VOID' : 'REFUND',
    action: actionType,
    amount_minor: actionType === 'refund' ? Number(transaction.amount_minor) : null,
    processor_transaction_id: actionType === 'void' ? (transaction.processor_reference || transaction.id) : null,
    state: 'queued',
    expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    created_by: context.user.id
  };
  const { data: created, error: insertError } = await terminal.from('device_commands').insert(command)
    .select('id, action, state, created_at').single();
  if (insertError) {
    console.error('[transaction/actions] unified command creation failed', insertError);
    return json({ error: 'The request could not be queued.' }, 500);
  }
  return json({ action: {
    id: created.id,
    transaction_id: transaction.id,
    action_type: created.action,
    status: created.state,
    requested_at: created.created_at
  } }, 201);
}
