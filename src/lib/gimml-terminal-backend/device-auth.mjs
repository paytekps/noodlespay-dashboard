import { createHash, createPublicKey, verify } from 'node:crypto';

export function canonicalRequest({ method, path, timestamp, nonce, body }) {
  if (!['GET', 'POST', 'PATCH'].includes(method)) throw new Error('Method not allowed');
  const allowed=['/device/login','/device/enroll','/device/commands','/device/command-result','/device/status','/transaction/create'];
  if (!allowed.includes(path) && !allowed.some(item=>`/api/v2${item}`===path)) throw new Error('Path not allowed');
  if (!/^[A-Za-z0-9_-]{22,64}$/.test(nonce)) throw new Error('Invalid nonce');
  const bodyHash = createHash('sha256').update(body).digest('base64');
  return Buffer.from(`${method}\n${path}\n${timestamp}\n${nonce}\n${bodyHash}`);
}

export async function authenticateDevice(request, repository, nowSeconds = Math.floor(Date.now()/1000)) {
  const { serial, timestamp, nonce, signature } = request;
  if (!Number.isSafeInteger(timestamp) || Math.abs(nowSeconds - timestamp) > 300) throw new Error('Request timestamp expired');
  const device = await repository.deviceBySerial(serial);
  if (!device?.publicKeyDer || device.enrollmentState !== 'active') throw new Error('Device is not enrolled');
  const publicKey = createPublicKey({ key: Buffer.from(device.publicKeyDer, 'base64'), format: 'der', type: 'spki' });
  if (!verify('sha256', request.canonical, publicKey, Buffer.from(signature, 'base64'))) throw new Error('Invalid device signature');
  if (!await repository.reserveNonce(device.id, nonce, timestamp + 300)) throw new Error('Request replayed');
  return device;
}
