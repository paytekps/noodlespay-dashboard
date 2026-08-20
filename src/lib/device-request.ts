import 'server-only';

import { createHash, timingSafeEqual } from 'node:crypto';
import { createServiceClient } from './server-supabase';

export type AuthenticatedDevice = {
  admin: ReturnType<typeof createServiceClient>;
  device: { id: string; merchant_id: string | null };
};

export async function authenticatedDeviceRequest(
  req: Request,
  deviceLookup: { serialNumber?: unknown; deviceId?: unknown }
): Promise<AuthenticatedDevice | { error: string; status: number }> {
  const serial = typeof deviceLookup.serialNumber === 'string'
    ? deviceLookup.serialNumber.trim().slice(0, 100)
    : '';
  const deviceId = typeof deviceLookup.deviceId === 'string'
    ? deviceLookup.deviceId.trim()
    : '';
  const token = req.headers.get('x-device-token')?.trim() ?? '';
  if ((!serial && !deviceId) || token.length < 40 || token.length > 100) {
    return { error: 'Device authentication failed.', status: 401 };
  }

  let admin: ReturnType<typeof createServiceClient>;
  try {
    admin = createServiceClient();
  } catch {
    return { error: 'Device service is not configured.', status: 503 };
  }

  let query = admin
    .from('devices')
    .select('id, merchant_id')
    .eq('status', 'active');
  query = serial ? query.eq('serial_number', serial) : query.eq('id', deviceId);
  const { data: device, error: deviceError } = await query.maybeSingle();
  if (deviceError || !device) {
    return { error: 'Device authentication failed.', status: 401 };
  }

  const { data: credential, error: credentialError } = await admin
    .from('device_command_credentials')
    .select('token_hash')
    .eq('device_id', device.id)
    .is('disabled_at', null)
    .maybeSingle();
  if (credentialError || !credential?.token_hash) {
    return { error: 'Device authentication failed.', status: 401 };
  }

  const suppliedHash = createHash('sha256').update(token, 'utf8').digest();
  const savedHash = Buffer.from(credential.token_hash, 'hex');
  if (savedHash.length !== suppliedHash.length || !timingSafeEqual(savedHash, suppliedHash)) {
    return { error: 'Device authentication failed.', status: 401 };
  }

  return { admin, device };
}
