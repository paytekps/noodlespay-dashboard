import { NextResponse } from 'next/server';
import { dashboardRequestContext } from '../../../../lib/dashboard-request';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const context = await dashboardRequestContext(req);
  if ('error' in context) {
    return NextResponse.json({ error: context.error }, { status: context.status });
  }

  const requestedDeviceId = new URL(req.url).searchParams.get('device_id')?.trim() ?? '';
  if (requestedDeviceId && !uuidPattern.test(requestedDeviceId)) {
    return NextResponse.json({ error: 'Choose a valid device.' }, { status: 400 });
  }

  if (context.merchantIds?.length === 0) {
    return NextResponse.json({ role: context.role, devices: [], settlements: [] });
  }

  let deviceQuery = context.admin
    .from('devices')
    .select('id, name, serial_number, merchant_id, status, merchants(name)')
    .order('name');
  if (context.merchantIds) deviceQuery = deviceQuery.in('merchant_id', context.merchantIds);
  if (requestedDeviceId) deviceQuery = deviceQuery.eq('id', requestedDeviceId);

  const { data: devices, error: deviceError } = await deviceQuery;
  if (deviceError) {
    console.error('Batch reporting device lookup failed:', deviceError);
    return NextResponse.json({ error: 'Batch reporting could not be loaded.' }, { status: 500 });
  }

  const deviceIds = (devices ?? []).map((device) => device.id);
  if (!deviceIds.length) {
    return NextResponse.json({ role: context.role, devices: [], settlements: [] });
  }

  const [runsResult, schedulesResult, profilesResult] = await Promise.all([
    context.admin
      .from('settlement_runs')
      .select('id, device_id, business_date, scheduled_for, request_source, status, requested_at, completed_at, attempt_count, transaction_count, total_amount, batch_id, device_message')
      .in('device_id', deviceIds)
      .order('requested_at', { ascending: false })
      .limit(500),
    context.admin
      .from('device_settlement_schedules')
      .select('device_id, enabled, settlement_time, time_zone')
      .in('device_id', deviceIds),
    context.admin
      .from('device_provisioning_profiles')
      .select('device_id, capture_mode, activation_status')
      .in('device_id', deviceIds)
  ]);

  const lookupError = runsResult.error || schedulesResult.error || profilesResult.error;
  if (lookupError) {
    console.error('Batch reporting lookup failed:', lookupError);
    return NextResponse.json({ error: 'Batch reporting could not be loaded.' }, { status: 500 });
  }

  const schedules = new Map((schedulesResult.data ?? []).map((schedule) => [schedule.device_id, schedule]));
  const profiles = new Map((profilesResult.data ?? []).map((profile) => [profile.device_id, profile]));

  const safeDevices = (devices ?? []).map((device) => {
    const profile = profiles.get(device.id);
    const schedule = schedules.get(device.id);
    const merchant = Array.isArray(device.merchants) ? device.merchants[0] : device.merchants;
    return {
      id: device.id,
      name: device.name,
      serial_number: device.serial_number,
      merchant_name: merchant?.name ?? 'Unknown merchant',
      capture_mode: profile?.capture_mode ?? 'not_configured',
      settlement_status: profile?.activation_status === 'active' ? 'active' : 'setup_required',
      auto_settlement_enabled: Boolean(schedule?.enabled),
      settlement_time: schedule?.settlement_time ?? null,
      time_zone: schedule?.time_zone ?? null
    };
  });

  return NextResponse.json({
    role: context.role,
    devices: safeDevices,
    settlements: runsResult.data ?? []
  });
}
