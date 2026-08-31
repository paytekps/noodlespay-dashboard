import { requireMinorUnits } from './money.mjs';
const SAFE = new Set(['transaction_id','device_id','amount_minor','currency','status','occurred_at','processor_reference','last4','authorization_code','reference_number','batch_id','trace_number','card_issuer','card_bin','account_type','entry_method','payment_program','result_code','transaction_type','host_message','base_amount_minor','tip_amount_minor','fee_amount_minor','cashback_amount_minor','processed_amount_minor','card_type','closed_loop_program_id','closed_loop_program']);

export async function acceptTransaction(repository, device, input, now=new Date()) {
  if (input.device_id !== device.id) throw new Error('Transaction targets another device');
  requireMinorUnits(input.amount_minor);
  if (!/^[A-Z]{3}$/.test(input.currency) || !['approved','declined','failed'].includes(input.status)) throw new Error('Invalid transaction');
  if (input.last4 != null && !/^\d{1,4}$/.test(input.last4)) throw new Error('Invalid last4');
  if (input.card_bin != null && !/^\d{6,8}$/.test(input.card_bin)) throw new Error('Invalid BIN');
  for(const key of ['base_amount_minor','tip_amount_minor','fee_amount_minor','cashback_amount_minor','processed_amount_minor'])if(input[key]!=null)requireMinorUnits(input[key]);
  for (const key of Object.keys(input)) if (!SAFE.has(key)) throw new Error(`Unsafe field: ${key}`);
  const occurred=new Date(input.occurred_at);if(!Number.isFinite(occurred.getTime())||occurred>new Date(now.getTime()+5*60*1000)||occurred<new Date(now.getTime()-366*86400000))throw new Error('Invalid transaction timestamp');
  if (!await repository.entitlementPermits(device.id,'DASHBOARD_REPORTING',occurred)) throw new Error('Dashboard reporting is not entitled');
  return repository.insertTransactionIdempotent(input);
}
