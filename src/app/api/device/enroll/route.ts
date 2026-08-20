export const dynamic = 'force-dynamic';

import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import { createServiceClient } from '../../../../lib/server-supabase';

function hash(value: string) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const serialNumber = typeof body.serial_number === 'string'
    ? body.serial_number.trim().slice(0, 100)
    : '';
  const pairingCode = typeof body.pairing_code === 'string'
    ? body.pairing_code.toUpperCase().replace(/[^A-Z0-9]/g, '')
    : '';
  const deviceToken = typeof body.device_token === 'string' ? body.device_token.trim() : '';

  if (!serialNumber || pairingCode.length !== 12 || !/^[A-Z2-9]+$/.test(pairingCode)) {
    return NextResponse.json({ error: 'Enter the complete pairing code.' }, { status: 400 });
  }
  if (!/^[A-Za-z0-9_-]{40,100}$/.test(deviceToken)) {
    return NextResponse.json({ error: 'The device credential is invalid.' }, { status: 400 });
  }

  let admin: ReturnType<typeof createServiceClient>;
  try {
    admin = createServiceClient();
  } catch {
    return NextResponse.json({ error: 'Device enrollment is not configured.' }, { status: 503 });
  }

  const { data: device, error: deviceError } = await admin
    .from('devices')
    .select('id')
    .eq('serial_number', serialNumber)
    .eq('status', 'active')
    .maybeSingle();
  if (deviceError || !device) {
    return NextResponse.json({ error: 'Device enrollment failed.' }, { status: 400 });
  }

  const { data: enrolled, error } = await admin.rpc('enroll_device_command_credential', {
    p_device_id: device.id,
    p_pairing_code_hash: hash(pairingCode),
    p_token_hash: hash(deviceToken)
  });

  if (error) {
    console.error('Device enrollment failed:', error);
    return NextResponse.json({ error: 'Device enrollment failed.' }, { status: 500 });
  }
  if (!enrolled) {
    return NextResponse.json(
      { error: 'The pairing code is invalid or expired. Create a new code on the dashboard.' },
      { status: 400 }
    );
  }

  return NextResponse.json({ success: true });
}
