import { NextResponse } from 'next/server';
import { createServiceClient } from '../../../../lib/server-supabase';

async function adminContext(req: Request) {
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return { error: 'Please sign in again.', status: 401 };
  try {
    const admin = createServiceClient();
    const { data: { user } } = await admin.auth.getUser(token);
    if (!user) return { error: 'Your session could not be verified.', status: 401 };
    const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).maybeSingle();
    if (profile?.role !== 'admin' && profile?.role !== 'super_admin') return { error: 'Administrator access is required.', status: 403 };
    return { admin };
  } catch (error) {
    console.error('Inquiry admin verification failed:', error);
    return { error: 'Inquiry management is not configured.', status: 503 };
  }
}

export async function GET(req: Request) {
  const context = await adminContext(req);
  if ('error' in context) return NextResponse.json({ error: context.error }, { status: context.status });
  const { data, error } = await context.admin.from('inquiries').select('id, created_at, updated_at, inquiry_type, status, full_name, email, phone, organization, plan, processor_preference, current_processor_name, quantity, message, shipping_address, shipping_city, shipping_state, shipping_postal_code, shipping_country, admin_notes, payment_status').order('created_at', { ascending: false }).limit(500);
  if (error) return NextResponse.json({ error: 'Inquiries could not be loaded.' }, { status: 500 });
  return NextResponse.json({ inquiries: data ?? [] });
}

export async function PATCH(req: Request) {
  const context = await adminContext(req);
  if ('error' in context) return NextResponse.json({ error: context.error }, { status: context.status });
  const body = await req.json().catch(() => ({}));
  const statuses = new Set(['new', 'contacted', 'qualified', 'closed']);
  if (typeof body.id !== 'string' || !statuses.has(body.status)) return NextResponse.json({ error: 'Invalid inquiry update.' }, { status: 400 });
  const notes = typeof body.adminNotes === 'string' ? body.adminNotes.trim().slice(0, 5000) : '';
  const { error } = await context.admin.from('inquiries').update({ status: body.status, admin_notes: notes || null, updated_at: new Date().toISOString() }).eq('id', body.id);
  if (error) return NextResponse.json({ error: 'The inquiry could not be updated.' }, { status: 500 });
  return NextResponse.json({ ok: true });
}
