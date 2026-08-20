export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { authenticatedDeviceRequest } from '../../../../lib/device-request';

function json(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store' }
  });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const context = await authenticatedDeviceRequest(req, { serialNumber: body.serial_number });
  if ('error' in context) return json({ error: context.error }, context.status);

  const { error: heartbeatError } = await context.admin
    .from('devices')
    .update({ last_seen_at: new Date().toISOString() })
    .eq('id', context.device.id);
  if (heartbeatError) console.error('Device heartbeat update failed:', heartbeatError);

  const { data: actions, error: claimError } = await context.admin
    .rpc('claim_device_transaction_action', { p_device_id: context.device.id });

  if (claimError) {
    console.error('Device command claim failed:', claimError);
    return json({ error: 'A device command could not be loaded.' }, 500);
  }

  const action = actions?.[0];
  if (!action) return json({ command: null });

  const { data: transaction, error: transactionError } = await context.admin
    .from('transactions')
    .select('transaction_id, authorization_code, reference_number, batch_id, trace_no')
    .eq('id', action.transaction_id)
    .maybeSingle();

  if (transactionError || !transaction) {
    console.error('Claimed command transaction lookup failed:', transactionError);
    await context.admin.rpc('complete_device_transaction_action', {
      p_device_id: context.device.id,
      p_action_id: action.id,
      p_success: false,
      p_message: 'The original transaction record is unavailable.',
      p_processor_reference: null
    });
    return json({ error: 'The original transaction record is unavailable.' }, 500);
  }

  return json({
    command: {
      id: action.id,
      action: action.action_type,
      amount: Number(action.amount),
      processor_transaction_id: transaction.transaction_id,
      authorization_code: transaction.authorization_code,
      reference_number: transaction.reference_number,
      batch_id: transaction.batch_id,
      trace_no: transaction.trace_no,
      card_may_be_required: action.action_type === 'refund'
    }
  });
}

export async function PATCH(req: Request) {
  const body = await req.json().catch(() => ({}));
  const context = await authenticatedDeviceRequest(req, { serialNumber: body.serial_number });
  if ('error' in context) return json({ error: context.error }, context.status);

  const commandId = typeof body.command_id === 'string' ? body.command_id : '';
  const outcome = body.outcome === 'succeeded' || body.outcome === 'failed'
    ? body.outcome
    : null;
  if (!commandId || !outcome) {
    return json({ error: 'A valid command result is required.' }, 400);
  }

  const message = typeof body.message === 'string' ? body.message.slice(0, 500) : null;
  const processorReference = typeof body.processor_reference === 'string'
    ? body.processor_reference.slice(0, 120)
    : null;

  const { data: actions, error } = await context.admin.rpc(
    'complete_device_transaction_action',
    {
      p_device_id: context.device.id,
      p_action_id: commandId,
      p_success: outcome === 'succeeded',
      p_message: message,
      p_processor_reference: processorReference
    }
  );

  if (error) {
    console.error('Device command completion failed:', error);
    return json({ error: 'The device command result could not be saved.' }, 500);
  }
  if (!actions?.length) {
    return json({ error: 'The active device command was not found.' }, 409);
  }

  return json({ success: true });
}
