import { requireMinorUnits } from './money.mjs';

export async function createCommand(repository, actor, input, now = new Date()) {
  if (!actor?.merchantId || actor.merchantId !== input.merchantId) throw new Error('Merchant access denied');
  if (!['void','refund','settlement'].includes(input.action)) throw new Error('Unsupported command');
  const capability = { void: 'VOID', refund: 'REFUND', settlement: 'SETTLEMENT' }[input.action];
  if (!await repository.entitlementPermits(input.deviceId, capability, now)) throw new Error('Capability is not entitled');
  if (input.action === 'refund') requireMinorUnits(input.amountMinor, { positive: true });
  if (input.action === 'void' && !/^[A-Za-z0-9._:-]{1,128}$/.test(input.processorTransactionId ?? '')) throw new Error('Original transaction required');
  return repository.insertCommand({ ...input, capability, expiresAt: new Date(now.getTime()+5*60*1000) });
}

export async function completeCommand(repository, device, input) {
  const deviceId=device?.id ?? device?.deviceId;
  if (!deviceId || !input?.id) throw new Error('Device and command are required');
  if (typeof input.succeeded !== 'boolean') throw new Error('Command outcome is required');
  if(input.transaction_count!=null&&(!Number.isSafeInteger(input.transaction_count)||input.transaction_count<0))throw new Error('Invalid transaction count');
  if(input.total_amount_minor!=null&&(!Number.isSafeInteger(input.total_amount_minor)||input.total_amount_minor<0))throw new Error('Invalid settlement total');
  if(input.total_currency!=null&&!/^[A-Z]{3}$/.test(input.total_currency))throw new Error('Invalid settlement currency');
  return repository.completeClaimedCommand({
    deviceId,
    commandId: input.id,
    state: input.succeeded ? 'succeeded' : 'failed',
    message: String(input.message ?? '').slice(0, 500),
    processorReference: (input.processor_reference ?? input.processorReference) == null ? null : String(input.processor_reference ?? input.processorReference).slice(0, 128),
    transactionCount: input.transaction_count ?? null,
    totalAmountMinor: input.total_amount_minor ?? null,
    totalCurrency: input.total_currency ?? null
  });
}
