import { NextResponse } from 'next/server';
import { canAccessMerchant, dashboardRequestContext, hasDashboardPermission } from '../../../../lib/dashboard-request';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const dynamic = 'force-dynamic';
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store, max-age=0' } });

export async function GET(req: Request) {
  const context = await dashboardRequestContext(req);
  if ('error' in context) return json({ error: context.error }, context.status);
  if (!hasDashboardPermission(context, 'batches.view')) return json({ error: 'You do not have permission to view batches.' }, 403);
  if (context.merchantIds?.length === 0) return json({ role: context.role, devices: [], settlements: [] });
  const requestedDeviceId = new URL(req.url).searchParams.get('device_id')?.trim() ?? '';
  if (requestedDeviceId && !uuidPattern.test(requestedDeviceId)) return json({ error: 'Choose a valid device.' }, 400);

  const terminal = context.admin.schema('gimml_terminal');
  let merchantQuery = terminal.from('merchants').select('id, display_name');
  if (context.merchantIds !== null) merchantQuery = merchantQuery.in('id', context.merchantIds);
  const { data: merchants, error: merchantError } = await merchantQuery;
  if (merchantError) {
    console.error('[dashboard/settlements] merchant lookup failed', merchantError);
    return json({ error: 'Batch reporting could not be loaded.' }, 500);
  }
  const merchantIds = (merchants ?? []).map(merchant => merchant.id);
  if (!merchantIds.length) return json({ role: context.role, devices: [], settlements: [] });

  let deviceQuery = terminal.from('devices').select('id, merchant_id, serial_number, enrollment_state').in('merchant_id', merchantIds).order('serial_number');
  if (requestedDeviceId) deviceQuery = deviceQuery.eq('id', requestedDeviceId);
  const { data: devices, error: deviceError } = await deviceQuery;
  if (deviceError) {
    console.error('[dashboard/settlements] device lookup failed', deviceError);
    return json({ error: 'Batch reporting could not be loaded.' }, 500);
  }
  const deviceIds = (devices ?? []).map(device => device.id);
  if (!deviceIds.length) return json({ role: context.role, devices: [], settlements: [] });

  const [commandsResult, settingsResult] = await Promise.all([
    terminal.from('device_commands')
      .select('id, device_id, created_at, completed_at, state, transaction_count, total_amount_minor, total_currency, processor_reference, outcome_message')
      .eq('action', 'settlement').in('device_id', deviceIds).order('created_at', { ascending: false }).limit(500),
    terminal.from('device_settings').select('device_id, value_json').eq('key', 'settlement').in('device_id', deviceIds)
  ]);
  if (commandsResult.error || settingsResult.error) {
    console.error('[dashboard/settlements] unified lookup failed', commandsResult.error || settingsResult.error);
    return json({ error: 'Batch reporting could not be loaded.' }, 500);
  }
  const names = new Map((merchants ?? []).map(merchant => [merchant.id, merchant.display_name]));
  const settings = new Map((settingsResult.data ?? []).map(row => [row.device_id, row.value_json as Record<string, unknown>]));
  return json({
    role: context.role,
    devices: (devices ?? []).map(device => {
      const schedule = settings.get(device.id);
      return {
        id: device.id,
        name: 'Datecs ' + device.serial_number,
        serial_number: device.serial_number,
        merchant_name: names.get(device.merchant_id) ?? 'Unknown merchant',
        capture_mode: 'terminal',
        settlement_status: device.enrollment_state === 'active' ? 'active' : 'setup_required',
        auto_settlement_enabled: schedule?.enabled === true,
        settlement_time: typeof schedule?.time === 'string' ? schedule.time : null,
        time_zone: typeof schedule?.timezone === 'string' ? schedule.timezone : null
      };
    }),
    settlements: (commandsResult.data ?? []).map(command => ({
      id: command.id,
      device_id: command.device_id,
      business_date: command.created_at.slice(0, 10),
      scheduled_for: null,
      request_source: 'manual',
      status: command.state,
      requested_at: command.created_at,
      completed_at: command.completed_at,
      attempt_count: command.state === 'queued' ? 0 : 1,
      transaction_count: command.transaction_count,
      total_amount: command.total_amount_minor == null ? null : Number(command.total_amount_minor) / 100,
      batch_id: command.processor_reference,
      device_message: command.outcome_message
    }))
  });
}

export async function POST(req: Request) {
  const context = await dashboardRequestContext(req);
  if ('error' in context) return json({ error: context.error }, context.status);
  if (!hasDashboardPermission(context, 'batches.manage')) return json({ error: 'You do not have permission to run settlement.' }, 403);
  const body = await req.json().catch(() => ({}));
  const deviceId = typeof body.deviceId === 'string' ? body.deviceId : '';
  if (!uuidPattern.test(deviceId) || body.confirm !== true) return json({ error: 'Confirm a valid terminal settlement request.' }, 400);
  const terminal = context.admin.schema('gimml_terminal');
  const { data: device, error: deviceError } = await terminal.from('devices').select('id, merchant_id, enrollment_state').eq('id', deviceId).maybeSingle();
  if (deviceError) return json({ error: 'The device could not be checked.' }, 500);
  if (!device || !canAccessMerchant(context, device.merchant_id)) return json({ error: 'Device not found.' }, 404);
  if (device.enrollment_state !== 'active') return json({ error: 'This combined terminal is not active.' }, 409);
  const { data: active } = await terminal.from('device_commands').select('id').eq('device_id', deviceId).eq('action', 'settlement').in('state', ['queued', 'claimed']).limit(1).maybeSingle();
  if (active) return json({ error: 'A settlement request is already active for this terminal.' }, 409);
  const { data: command, error } = await terminal.from('device_commands').insert({
    id: crypto.randomUUID(),
    merchant_id: device.merchant_id,
    device_id: device.id,
    capability_key: 'SETTLEMENT',
    action: 'settlement',
    state: 'queued',
    expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    created_by: context.user.id
  }).select('id, state, created_at').single();
  if (error) {
    console.error('[dashboard/settlements] command creation failed', error);
    return json({ error: 'End of Day could not be queued.' }, 500);
  }
  return json({ command }, 201);
}
