import { createHash, randomBytes } from 'node:crypto';
import { NextResponse } from 'next/server';
import { dashboardRequestContext } from '../../../../../lib/dashboard-request';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const pairingAlphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function newPairingCode() {
  const bytes = randomBytes(12);
  const raw = Array.from(bytes, (byte) => pairingAlphabet[byte % pairingAlphabet.length]).join('');
  return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8)}`;
}

function hashCode(code: string) {
  return createHash('sha256').update(code.replace(/[^A-Z0-9]/g, ''), 'utf8').digest('hex');
}

async function administratorContext(req: Request) {
  const context = await dashboardRequestContext(req);
  if ('error' in context) return context;
  if (context.role !== 'super_admin' && context.role !== 'admin') {
    return { error: 'Administrator access is required.', status: 403 };
  }
  return context;
}

export async function GET(req: Request) {
  const context = await administratorContext(req);
  if ('error' in context) {
    return NextResponse.json({ error: context.error }, { status: context.status });
  }

  const ids = [...new Set(
    (new URL(req.url).searchParams.get('device_ids')?.split(',') ?? [])
      .map((id) => id.trim())
      .filter((id) => uuidPattern.test(id))
  )].slice(0, 200);
  if (!ids.length) return NextResponse.json({ paired_device_ids: [] });

  const { data, error } = await context.admin
    .from('device_command_credentials')
    .select('device_id')
    .in('device_id', ids)
    .is('disabled_at', null);

  if (error) {
    console.error('Device pairing status lookup failed:', error);
    return NextResponse.json({ error: 'Pairing status could not be loaded.' }, { status: 500 });
  }
  return NextResponse.json({ paired_device_ids: (data ?? []).map((row) => row.device_id) });
}

export async function POST(req: Request) {
  const context = await administratorContext(req);
  if ('error' in context) {
    return NextResponse.json({ error: context.error }, { status: context.status });
  }

  const body = await req.json().catch(() => ({}));
  const deviceId = typeof body.deviceId === 'string' ? body.deviceId : '';
  if (!uuidPattern.test(deviceId)) {
    return NextResponse.json({ error: 'Choose a valid device.' }, { status: 400 });
  }

  const { data: device, error: deviceError } = await context.admin
    .from('devices')
    .select('id')
    .eq('id', deviceId)
    .eq('status', 'active')
    .maybeSingle();
  if (deviceError || !device) {
    return NextResponse.json({ error: 'Active device not found.' }, { status: 404 });
  }

  const now = new Date();
  const expiresAt = new Date(now.getTime() + 10 * 60 * 1000);
  const pairingCode = newPairingCode();

  const { error: invalidateError } = await context.admin
    .from('device_pairing_codes')
    .update({ used_at: now.toISOString() })
    .eq('device_id', device.id)
    .is('used_at', null);
  if (invalidateError) {
    console.error('Previous pairing code invalidation failed:', invalidateError);
    return NextResponse.json({ error: 'A pairing code could not be created.' }, { status: 500 });
  }

  const { error: insertError } = await context.admin
    .from('device_pairing_codes')
    .insert({
      device_id: device.id,
      code_hash: hashCode(pairingCode),
      created_by: context.user.id,
      expires_at: expiresAt.toISOString()
    });
  if (insertError) {
    console.error('Pairing code creation failed:', insertError);
    return NextResponse.json({ error: 'A pairing code could not be created.' }, { status: 500 });
  }

  return NextResponse.json({ pairing_code: pairingCode, expires_at: expiresAt.toISOString() });
}
