import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createServiceClient } from '../../../../lib/server-supabase';
import { getStripe } from '../../../../lib/stripe';

function subscriptionId(value: string | Stripe.Subscription | null) {
  return typeof value === 'string' ? value : value?.id ?? null;
}

export async function POST(req: Request) {
  const stripe = getStripe();
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const signature = req.headers.get('stripe-signature');
  if (!stripe || !webhookSecret || !signature) return NextResponse.json({ error: 'Webhook is not configured.' }, { status: 503 });
  const rawBody = await req.text();
  let event: Stripe.Event;
  try { event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret); }
  catch { return NextResponse.json({ error: 'Invalid signature.' }, { status: 400 }); }

  const admin = createServiceClient();
  const terminal = admin.schema('gimml_terminal');
  const digest = createHash('sha256').update(rawBody).digest('hex');
  const { error: eventInsertError } = await terminal.from('billing_events').insert({
    provider: 'stripe', external_event_id: event.id, event_type: event.type,
    payload_sha256: '\\x' + digest, outcome: 'processing'
  });
  if (eventInsertError?.code === '23505') return NextResponse.json({ received: true, duplicate: true });
  if (eventInsertError) {
    console.error('[stripe] billing event insert failed', eventInsertError);
    return NextResponse.json({ error: 'Billing event could not be recorded.' }, { status: 500 });
  }

  try {
    if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
      const session = event.data.object;
      if (session.metadata?.kind === 'gimml_feature' && session.metadata.request_id) {
        const requestId = session.metadata.request_id;
        const { data: requestRow } = await terminal.from('feature_checkout_requests').select('*').eq('id', requestId).eq('stripe_session_id', session.id).maybeSingle();
        if (!requestRow) throw new Error('Feature checkout request was not found.');
        const externalSubscriptionId = subscriptionId(session.subscription);
        if (!externalSubscriptionId) throw new Error('Stripe subscription was not returned.');
        const subscription = await stripe.subscriptions.retrieve(externalSubscriptionId);
        if (!['active', 'trialing'].includes(subscription.status)) throw new Error('Stripe subscription is not active.');
        const subscriptionItem = subscription.items.data[0];
        const itemId = subscriptionItem?.id;
        if (!subscriptionItem || !itemId) throw new Error('Stripe subscription item was not returned.');
        const entitlementId = crypto.randomUUID();
        const { error: entitlementError } = await terminal.from('merchant_entitlements').insert({
          id: entitlementId, merchant_id: requestRow.merchant_id, sku: requestRow.sku,
          capability_key: requestRow.capability_key, state: subscription.status,
          quantity: 1, starts_at: new Date(subscription.start_date * 1000).toISOString(),
          expires_at: new Date(subscriptionItem.current_period_end * 1000).toISOString(),
          source: 'stripe', external_subscription_id: subscription.id, external_subscription_item_id: itemId
        });
        if (entitlementError?.code !== '23505' && entitlementError) throw entitlementError;
        const { data: entitlement } = await terminal.from('merchant_entitlements').select('id').eq('external_subscription_item_id', itemId).single();
        const { error: assignmentError } = await terminal.from('device_assignments').insert({
          id: crypto.randomUUID(), entitlement_id: entitlement.id, device_id: requestRow.device_id
        });
        if (assignmentError?.code !== '23505' && assignmentError) throw assignmentError;
        await terminal.from('feature_checkout_requests').update({ status: 'paid', updated_at: new Date().toISOString() }).eq('id', requestId);
      } else {
        const inquiryId = session.metadata?.inquiry_id;
        if (inquiryId) await admin.from('inquiries').update({ payment_status: 'paid', status: 'qualified', updated_at: new Date().toISOString() }).eq('id', inquiryId).eq('stripe_checkout_session_id', session.id);
      }
    }
    if (event.type === 'checkout.session.async_payment_failed') {
      const session = event.data.object;
      if (session.metadata?.kind === 'gimml_feature' && session.metadata.request_id) {
        await terminal.from('feature_checkout_requests').update({ status: 'failed', updated_at: new Date().toISOString() }).eq('id', session.metadata.request_id).eq('stripe_session_id', session.id);
      } else if (session.metadata?.inquiry_id) {
        await admin.from('inquiries').update({ payment_status: 'failed', updated_at: new Date().toISOString() }).eq('id', session.metadata.inquiry_id).eq('stripe_checkout_session_id', session.id);
      }
    }
    if (event.type === 'customer.subscription.deleted') {
      const subscription = event.data.object;
      await terminal.from('merchant_entitlements').update({ state: 'cancelled', expires_at: new Date().toISOString() }).eq('external_subscription_id', subscription.id);
      if (subscription.metadata.request_id) await terminal.from('feature_checkout_requests').update({ status: 'cancelled', updated_at: new Date().toISOString() }).eq('id', subscription.metadata.request_id);
    }
    await terminal.from('billing_events').update({ processed_at: new Date().toISOString(), outcome: 'processed' }).eq('provider', 'stripe').eq('external_event_id', event.id);
    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('[stripe] unified billing event failed', event.id, error);
    await terminal.from('billing_events').update({ processed_at: new Date().toISOString(), outcome: 'failed' }).eq('provider', 'stripe').eq('external_event_id', event.id);
    return NextResponse.json({ error: 'Billing event processing failed.' }, { status: 500 });
  }
}
