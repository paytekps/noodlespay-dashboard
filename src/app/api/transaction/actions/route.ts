import { NextResponse } from 'next/server';
import {
  canAccessMerchant,
  dashboardRequestContext
} from '../../../../lib/dashboard-request';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function transactionIdsFrom(req: Request) {
  const values = new URL(req.url).searchParams.get('transaction_ids')?.split(',') ?? [];
  return [...new Set(values.map((value) => value.trim()).filter((value) => uuidPattern.test(value)))].slice(0, 200);
}

export async function GET(req: Request) {
  const context = await dashboardRequestContext(req);
  if ('error' in context) {
    return NextResponse.json({ error: context.error }, { status: context.status });
  }

  const transactionIds = transactionIdsFrom(req);
  if (!transactionIds.length) return NextResponse.json({ actions: [] });

  let query = context.admin
    .from('transaction_actions')
    .select('id, transaction_id, action_type, amount, status, requested_at, completed_at, device_message, processor_reference')
    .in('transaction_id', transactionIds)
    .order('requested_at', { ascending: false });

  if (context.merchantIds !== null) {
    if (!context.merchantIds.length) return NextResponse.json({ actions: [] });
    query = query.in('merchant_id', context.merchantIds);
  }

  const { data, error } = await query;
  if (error) {
    console.error('Transaction action lookup failed:', error);
    return NextResponse.json({ error: 'Transaction actions could not be loaded.' }, { status: 500 });
  }

  return NextResponse.json({ actions: data ?? [] });
}

export async function POST(req: Request) {
  const context = await dashboardRequestContext(req);
  if ('error' in context) {
    return NextResponse.json({ error: context.error }, { status: context.status });
  }

  if (context.role === 'sales_rep') {
    return NextResponse.json(
      { error: 'Sales representatives can review transactions but cannot void or refund them.' },
      { status: 403 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const transactionId = typeof body.transactionId === 'string' ? body.transactionId : '';
  const actionType = body.actionType === 'void' || body.actionType === 'refund'
    ? body.actionType
    : null;

  if (!uuidPattern.test(transactionId) || !actionType) {
    return NextResponse.json({ error: 'Choose a valid transaction action.' }, { status: 400 });
  }

  const { data: transaction, error: transactionError } = await context.admin
    .from('transactions')
    .select('id, device_id, merchant_id, amount, processed_amount, status, transaction_id')
    .eq('id', transactionId)
    .maybeSingle();

  if (transactionError) {
    console.error('Transaction action source lookup failed:', transactionError);
    return NextResponse.json({ error: 'The transaction could not be checked.' }, { status: 500 });
  }
  if (!transaction || !canAccessMerchant(context, transaction.merchant_id)) {
    return NextResponse.json({ error: 'Transaction not found.' }, { status: 404 });
  }
  if (transaction.status !== 'approved') {
    return NextResponse.json(
      { error: 'Only an approved transaction can be voided or refunded.' },
      { status: 400 }
    );
  }
  if (actionType === 'void' && !transaction.transaction_id) {
    return NextResponse.json(
      { error: 'This transaction is missing the processor ID needed for a void.' },
      { status: 400 }
    );
  }

  const actionAmount = Number(transaction.processed_amount ?? transaction.amount);
  if (!Number.isFinite(actionAmount) || actionAmount <= 0) {
    return NextResponse.json({ error: 'The original transaction amount is invalid.' }, { status: 400 });
  }

  const { data: credential, error: credentialError } = await context.admin
    .from('device_command_credentials')
    .select('device_id')
    .eq('device_id', transaction.device_id)
    .is('disabled_at', null)
    .maybeSingle();

  if (credentialError) {
    console.error('Device command credential lookup failed:', credentialError);
    return NextResponse.json({ error: 'The device could not be checked.' }, { status: 500 });
  }
  if (!credential) {
    return NextResponse.json(
      { error: 'Remote actions are not yet enabled for this device.' },
      { status: 409 }
    );
  }

  const { data: action, error: insertError } = await context.admin
    .from('transaction_actions')
    .insert({
      transaction_id: transaction.id,
      device_id: transaction.device_id,
      merchant_id: transaction.merchant_id,
      action_type: actionType,
      amount: actionAmount,
      requested_by: context.user.id
    })
    .select('id, transaction_id, action_type, amount, status, requested_at')
    .single();

  if (insertError?.code === '23505') {
    return NextResponse.json(
      { error: 'A Void or Refund request is already active for this transaction.' },
      { status: 409 }
    );
  }
  if (insertError) {
    console.error('Transaction action creation failed:', insertError);
    return NextResponse.json({ error: 'The request could not be queued.' }, { status: 500 });
  }

  return NextResponse.json({ action }, { status: 201 });
}
