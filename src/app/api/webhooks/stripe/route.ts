import { NextResponse } from 'next/server';
import { createServiceClient } from '../../../../lib/server-supabase';
import { getStripe } from '../../../../lib/stripe';

export async function POST(req: Request) {
  const stripe = getStripe();
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const signature = req.headers.get('stripe-signature');
  if (!stripe || !webhookSecret || !signature) return NextResponse.json({ error: 'Webhook is not configured.' }, { status: 503 });
  let event;
  try { event = stripe.webhooks.constructEvent(await req.text(), signature, webhookSecret); }
  catch { return NextResponse.json({ error: 'Invalid signature.' }, { status: 400 }); }

  if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
    const session = event.data.object;
    const inquiryId = session.metadata?.inquiry_id;
    if (inquiryId) await createServiceClient().from('inquiries').update({ payment_status: 'paid', status: 'qualified', updated_at: new Date().toISOString() }).eq('id', inquiryId).eq('stripe_checkout_session_id', session.id);
  }
  if (event.type === 'checkout.session.async_payment_failed') {
    const session = event.data.object;
    const inquiryId = session.metadata?.inquiry_id;
    if (inquiryId) await createServiceClient().from('inquiries').update({ payment_status: 'failed', updated_at: new Date().toISOString() }).eq('id', inquiryId).eq('stripe_checkout_session_id', session.id);
  }
  return NextResponse.json({ received: true });
}
