export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { authenticatedDeviceRequest } from '../../../../lib/device-request';

function json(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store' }
  });
}

function finiteNumber(value: unknown) {
  const number = typeof value === 'number' ? value : Number.NaN;
  return Number.isFinite(number) ? number : null;
}

function heartbeatUpdate(body: Record<string, unknown>) {
  const now = Date.now();
  const update: Record<string, string | number | boolean | null> = {
    last_seen_at: new Date(now).toISOString()
  };

  if (typeof body.location_permission_granted === 'boolean') {
    update.location_permission_granted = body.location_permission_granted;
  }
  if (typeof body.location_service_enabled === 'boolean') {
    update.location_service_enabled = body.location_service_enabled;
  }

  const refreshStatus = typeof body.location_refresh_status === 'string'
    ? body.location_refresh_status
    : '';
  if (['enabled', 'permission_required', 'settings_required', 'error'].includes(refreshStatus)) {
    update.location_refresh_status = refreshStatus;
    update.location_refresh_status_updated_at = new Date(now).toISOString();
  }

  const appVersion = typeof body.app_version === 'string'
    ? body.app_version.trim().slice(0, 60)
    : '';
  if (appVersion) update.app_version = appVersion;

  const latitude = finiteNumber(body.location_latitude);
  const longitude = finiteNumber(body.location_longitude);
  const accuracy = finiteNumber(body.location_accuracy_m);
  const recordedAtMs = finiteNumber(body.location_recorded_at_ms);
  const provider = typeof body.location_provider === 'string'
    ? body.location_provider.trim().slice(0, 30)
    : '';
  const locationTimeIsReasonable = recordedAtMs !== null
    && recordedAtMs >= now - 7 * 24 * 60 * 60 * 1000
    && recordedAtMs <= now + 5 * 60 * 1000;

  if (body.location_permission_granted === true
      && latitude !== null && latitude >= -90 && latitude <= 90
      && longitude !== null && longitude >= -180 && longitude <= 180
      && locationTimeIsReasonable) {
    update.location_latitude = latitude;
    update.location_longitude = longitude;
    update.location_updated_at = new Date(recordedAtMs).toISOString();
    if (accuracy !== null && accuracy >= 0 && accuracy <= 100000) {
      update.location_accuracy_m = accuracy;
    }
    if (/^[a-z0-9_-]{1,30}$/i.test(provider)) {
      update.location_provider = provider;
    }
  }

  return update;
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const context = await authenticatedDeviceRequest(req, { serialNumber: body.serial_number });
  if ('error' in context) return json({ error: context.error }, context.status);

  const { error: heartbeatError } = await context.admin
    .from('devices')
    .update(heartbeatUpdate(body))
    .eq('id', context.device.id);
  if (heartbeatError) console.error('Device heartbeat update failed:', heartbeatError);

  const { data: locationControl, error: locationControlError } = await context.admin
    .from('devices')
    .select('location_refresh_requested_at')
    .eq('id', context.device.id)
    .maybeSingle();
  if (locationControlError) {
    console.error('Device location request lookup failed:', locationControlError);
  }

  const { data: actions, error: claimError } = await context.admin
    .rpc('claim_device_transaction_action', { p_device_id: context.device.id });

  if (claimError) {
    console.error('Device command claim failed:', claimError);
    return json({ error: 'A device command could not be loaded.' }, 500);
  }

  const action = actions?.[0];
  const locationRequest = locationControl?.location_refresh_requested_at
    ? { requested_at: locationControl.location_refresh_requested_at }
    : null;
  if (!action) {
    const { data: settlements, error: settlementClaimError } = await context.admin
      .rpc('claim_device_settlement', { p_device_id: context.device.id });
    if (settlementClaimError) {
      console.error('Device settlement claim failed:', settlementClaimError);
      return json({ error: 'A settlement command could not be loaded.' }, 500);
    }
    const settlement = settlements?.[0];
    if (!settlement) return json({ command: null, location_request: locationRequest });
    return json({
      location_request: locationRequest,
      command: {
        id: settlement.id,
        action: 'settlement',
        amount: 0,
        business_date: settlement.business_date,
        request_source: settlement.request_source
      }
    });
  }

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
    location_request: locationRequest,
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
  if (actions?.length) {
    return json({ success: true, command_type: 'transaction_action' });
  }

  const transactionCount = Number.isInteger(body.transaction_count)
    && body.transaction_count >= 0 && body.transaction_count <= 1000000
    ? body.transaction_count
    : null;
  const totalAmount = finiteNumber(body.total_amount);
  const batchId = typeof body.batch_id === 'string' ? body.batch_id.slice(0, 120) : null;
  const { data: settlements, error: settlementError } = await context.admin.rpc(
    'complete_device_settlement',
    {
      p_device_id: context.device.id,
      p_run_id: commandId,
      p_success: outcome === 'succeeded',
      p_message: message,
      p_transaction_count: transactionCount,
      p_total_amount: totalAmount !== null && totalAmount >= 0 ? totalAmount : null,
      p_batch_id: batchId
    }
  );
  if (settlementError) {
    console.error('Device settlement completion failed:', settlementError);
    return json({ error: 'The settlement result could not be saved.' }, 500);
  }
  if (!settlements?.length) return json({ error: 'The active device command was not found.' }, 409);
  return json({ success: true, command_type: 'settlement' });
}
