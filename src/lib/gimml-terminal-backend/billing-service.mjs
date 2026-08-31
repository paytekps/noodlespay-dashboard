import {createHash} from 'node:crypto';
const STATES=new Set(['trialing','active','grace','past_due','suspended','cancelled','expired']);

/** Applies only billing events whose provider signature was verified by the deployment adapter. */
export async function applyVerifiedBillingEvent(repository,event){
 if(event?.signatureVerified!==true)throw new Error('Billing signature is not verified');
 for(const [name,value] of Object.entries({provider:event.provider,eventId:event.eventId,eventType:event.eventType,merchantId:event.merchantId,subscriptionId:event.subscriptionId,planKey:event.planKey}))if(typeof value!=='string'||!value.trim())throw new Error(`Invalid ${name}`);
 if(!STATES.has(event.state))throw new Error('Invalid subscription state');
 const start=new Date(event.currentPeriodStart),end=event.currentPeriodEnd==null?null:new Date(event.currentPeriodEnd);if(!Number.isFinite(start.getTime())||end&&!Number.isFinite(end.getTime())||end&&end<=start)throw new Error('Invalid billing period');
 const payload=Buffer.isBuffer(event.rawPayload)?event.rawPayload:Buffer.from(event.rawPayload??'');if(!payload.length)throw new Error('Raw billing payload required');
 return repository.applyBillingEvent({provider:event.provider,eventId:event.eventId,eventType:event.eventType,merchantId:event.merchantId,externalCustomerId:event.customerId??null,externalSubscriptionId:event.subscriptionId,planKey:event.planKey,state:event.state,currentPeriodStart:start,currentPeriodEnd:end,cancelAtPeriodEnd:event.cancelAtPeriodEnd===true,payloadSha256:createHash('sha256').update(payload).digest()});
}
