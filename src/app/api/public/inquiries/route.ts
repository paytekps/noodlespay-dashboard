import { NextResponse } from 'next/server';
import { createServiceClient } from '../../../../lib/server-supabase';

const validPlans = new Set(['basic', 'pro', 'premium']);
const validProcessorPreferences = new Set(['existing_account', 'fiserv_rapid_connect', 'tsys_sierra', 'stripe_terminal', 'help_me_choose']);
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function text(value: unknown, max: number) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  if (text(body.website, 100)) return NextResponse.json({ ok: true });

  const inquiryType = body.inquiryType === 'order_request' ? 'order_request' : 'contact';
  const fullName = text(body.fullName, 120);
  const email = text(body.email, 254).toLowerCase();
  const plan = validPlans.has(body.plan) ? body.plan : null;
  const processorPreference = validProcessorPreferences.has(body.processorPreference) ? body.processorPreference : null;
  const quantity = Number(body.quantity);
  if (!fullName || !emailPattern.test(email)) return NextResponse.json({ error: 'Enter your name and a valid email address.' }, { status: 400 });
  if (inquiryType === 'order_request' && (!plan || !processorPreference || !Number.isInteger(quantity) || quantity < 1 || quantity > 100)) return NextResponse.json({ error: 'Select a plan, payment-processing preference, and a device quantity from 1 to 100.' }, { status: 400 });

  try {
    const admin = createServiceClient();
    const oneMinuteAgo = new Date(Date.now() - 60_000).toISOString();
    const { count } = await admin.from('inquiries').select('id', { count: 'exact', head: true }).eq('email', email).gte('created_at', oneMinuteAgo);
    if ((count ?? 0) > 0) return NextResponse.json({ error: 'We already received a recent request from this email. Please wait a moment.' }, { status: 429 });

    const { data, error } = await admin.from('inquiries').insert({
      inquiry_type: inquiryType,
      full_name: fullName,
      email,
      phone: text(body.phone, 40) || null,
      organization: text(body.organization, 160) || null,
      plan,
      processor_preference: inquiryType === 'order_request' ? processorPreference : null,
      current_processor_name: inquiryType === 'order_request' ? text(body.currentProcessorName, 120) || null : null,
      quantity: inquiryType === 'order_request' ? quantity : null,
      message: text(body.message, 3000) || null,
      shipping_address: text(body.shippingAddress, 250) || null,
      shipping_city: text(body.shippingCity, 120) || null,
      shipping_state: text(body.shippingState, 120) || null,
      shipping_postal_code: text(body.shippingPostalCode, 30) || null,
      shipping_country: text(body.shippingCountry, 80) || null
    }).select('id, checkout_token').single();
    if (error || !data) throw error || new Error('Inquiry was not returned.');
    return NextResponse.json({ ok: true, inquiryId: data.id, checkoutToken: data.checkout_token });
  } catch (error) {
    console.error('Public inquiry failed:', error);
    return NextResponse.json({ error: 'Your request could not be saved. Please try again.' }, { status: 500 });
  }
}
