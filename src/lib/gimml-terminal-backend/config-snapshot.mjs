import { createHash, createPrivateKey, sign } from 'node:crypto';

function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${stable(value[k])}`).join(',')}}`;
  return JSON.stringify(value);
}

export function signSnapshot(snapshot, privateKeyDerBase64) {
  const body = Buffer.from(stable(snapshot));
  const key = createPrivateKey({ key: Buffer.from(privateKeyDerBase64, 'base64'), format: 'der', type: 'pkcs8' });
  return { body, sha256: createHash('sha256').update(body).digest(), signature: sign('sha256', body, key) };
}

export async function compileDeviceSnapshot(repository, deviceId, now = new Date()) {
  const device = await repository.deviceConfiguration(deviceId);
  if (!device) throw new Error('Unknown device');
  const revision = await repository.configurationRevision(deviceId);
  const issued = now.toISOString(), expires = new Date(now.getTime() + 24*60*60*1000).toISOString();
  return { serial: device.serial, device_id: device.id, merchant_name: device.merchantName, profile: device.profile, layout: device.layout, revision, issued_at: issued, expires_at: expires, settings: device.settings, merchant_entitlements: device.entitlements, device_assignments: device.assignments, closed_loop_programs: device.closedLoopPrograms };
}
