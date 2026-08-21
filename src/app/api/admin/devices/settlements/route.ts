import { NextResponse } from 'next/server';
import { dashboardRequestContext } from '../../../../../lib/dashboard-request';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function administratorContext(req: Request) {
  const context = await dashboardRequestContext(req);
  if ('error' in context) return context;
  if (context.role !== 'super_admin' && context.role !== 'admin') {
    return { error: 'Administrator access is required.', status: 403 };
  }
  return context;
}

function businessDate(timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export async function POST(req: Request) {
  const context = await administratorContext(req);
  if ('error' in context) return NextResponse.json({ error: context.error }, { status: context.status });

  const body = await req.json().catch(() => ({}));
  const deviceId = typeof body.deviceId === 'string' ? body.deviceId : '';
  if (!uuidPattern.test(deviceId) || body.confirm !== true) {
    return NextResponse.json({ error: 'Confirm a valid device settlement request.' }, { status: 400 });
  }

  const [deviceResult, profileResult, pairingResult] = await Promise.all([
    context.admin.from('devices').select('id, merchant_id, status').eq('id', deviceId).maybeSingle(),
    context.admin.from('device_provisioning_profiles').select('capture_mode, activation_status, key_injection_status, merchant_identification_number, terminal_identification_number, time_zone').eq('device_id', deviceId).maybeSingle(),
    context.admin.from('device_command_credentials').select('device_id').eq('device_id', deviceId).is('disabled_at', null).maybeSingle()
  ]);
  if (deviceResult.error || profileResult.error || pairingResult.error) {
    console.error('Manual settlement readiness lookup failed:', deviceResult.error || profileResult.error || pairingResult.error);
    return NextResponse.json({ error: 'Settlement readiness could not be checked.' }, { status: 500 });
  }
  const device = deviceResult.data;
  const profile = profileResult.data;
  if (!device?.merchant_id || device.status !== 'active') return NextResponse.json({ error: 'Active device not found.' }, { status: 404 });
  if (!pairingResult.data) return NextResponse.json({ error: 'Pair this device before sending a settlement command.' }, { status: 409 });
  if (!profile || profile.capture_mode !== 'terminal') return NextResponse.json({ error: 'Only a terminal-capture device can run End of Day.' }, { status: 409 });
  if (profile.activation_status !== 'active' || profile.key_injection_status !== 'complete' || !profile.merchant_identification_number || !profile.terminal_identification_number) {
    return NextResponse.json({ error: 'Finish and activate the processor setup before settlement.' }, { status: 409 });
  }

  let date: string;
  try {
    date = businessDate(profile.time_zone);
  } catch {
    return NextResponse.json({ error: 'The device time zone is invalid.' }, { status: 409 });
  }

  const { data: run, error } = await context.admin.from('settlement_runs').insert({
    device_id: device.id,
    merchant_id: device.merchant_id,
    business_date: date,
    request_source: 'manual',
    requested_by: context.user.id
  }).select('id, business_date, request_source, status, requested_at').single();

  if (error?.code === '23505') {
    return NextResponse.json({ error: 'This device already has a settlement waiting or processing.' }, { status: 409 });
  }
  if (error) {
    console.error('Manual settlement queue failed:', error);
    return NextResponse.json({ error: 'Settlement could not be queued.' }, { status: 500 });
  }
  return NextResponse.json({ settlement: run }, { status: 201 });
}
