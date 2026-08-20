import { NextResponse } from 'next/server';
import { createServiceClient } from '../../../lib/server-supabase';
import { getStripe, stripePlanPriceIds } from '../../../lib/stripe';

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  if (typeof body.inquiryId !== 'string' || typeof body.checkoutToken !== 'string') return NextResponse.json({ checkoutReady: false }, { status: 400 });
  const stripe = getStripe();
  const devicePriceId = process.env.STRIPE_DEVICE_PRICE_ID;
  const siteUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!stripe || !devicePriceId || !siteUrl) return NextResponse.json({ checkoutReady: false });

  const admin = createServiceClient();
  const { data: inquiry } = await admin.from('inquiries').select('id, plan, quantity, email, checkout_token, stripe_checkout_session_id').eq('id', body.inquiryId).eq('checkout_token', body.checkoutToken).eq('inquiry_type', 'order_request').maybeSingle();
  if (!inquiry) return NextResponse.json({ error: 'Order request not found.' }, { status: 404 });
  const planPriceId = inquiry.plan ? stripePlanPriceIds[inquiry.plan as keyof typeof stripePlanPriceIds] : null;
  if (!planPriceId) return NextResponse.json({ checkoutReady: false });

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer_email: inquiry.email,
    line_items: [{ price: devicePriceId, quantity: inquiry.quantity }, { price: planPriceId, quantity: inquiry.quantity }],
    success_url: `${siteUrl}/order/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${siteUrl}/signup?plan=${inquiry.plan}`,
    metadata: { inquiry_id: inquiry.id }
  });
  await admin.from('inquiries').update({ stripe_checkout_session_id: session.id, payment_status: 'checkout_created', updated_at: new Date().toISOString() }).eq('id', inquiry.id);
  return NextResponse.json({ checkoutReady: true, url: session.url });
}
