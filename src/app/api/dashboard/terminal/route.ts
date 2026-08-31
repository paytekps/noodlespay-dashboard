import { NextResponse } from 'next/server';
import { dashboardRequestContext } from '../../../../lib/dashboard-request';

async function contextFor(req: Request) {
  const context = await dashboardRequestContext(req);
  if ('error' in context) return context;
  if (context.role === 'sales_rep') return { error: 'Merchant or administrator access is required.', status: 403 };
  return context;
}

export async function GET(req: Request) {
  const context = await contextFor(req);
  if ('error' in context) return NextResponse.json({ error: context.error }, { status: context.status });
  const terminal = context.admin.schema('gimml_terminal');
  let merchantQuery = terminal.from('merchants').select('id, display_name, billing_status, devices(id, merchant_id, serial_number, enrollment_state, config_revision, last_seen_at, device_profiles(profile_key, layout_key))').order('display_name');
  if (context.merchantIds !== null) merchantQuery = merchantQuery.in('id', context.merchantIds.length ? context.merchantIds : ['00000000-0000-0000-0000-000000000000']);

  let entitlementQuery = terminal.from('merchant_entitlements').select('id, merchant_id, sku, capability_key, state, device_assignments(device_id, revoked_at)').in('state', ['active', 'trial', 'trialing', 'grace', 'past_due']);
  if (context.merchantIds !== null) entitlementQuery = entitlementQuery.in('merchant_id', context.merchantIds.length ? context.merchantIds : ['00000000-0000-0000-0000-000000000000']);
  let transactionQuery = terminal.from('dashboard_transactions').select('transaction_id, merchant_id, serial_number, amount_minor, currency, status, transaction_type, entry_method, card_type, last4, authorization_code, batch_id, closed_loop_program, occurred_at').order('occurred_at', { ascending: false }).limit(100);
  if (context.merchantIds !== null) transactionQuery = transactionQuery.in('merchant_id', context.merchantIds.length ? context.merchantIds : ['00000000-0000-0000-0000-000000000000']);
  const [capabilities, merchants, plans, entitlements, transactions] = await Promise.all([
    terminal.from('capabilities').select('key, classification, scope, risk, active, catalog_items(sku, display_name, unit_price_cents, billing_interval, active)').order('key'),
    merchantQuery,
    terminal.from('plans').select('key, display_name, description, active').order('sort_order'),
    entitlementQuery,
    transactionQuery
  ]);
  const error = capabilities.error || merchants.error || plans.error || entitlements.error || transactions.error;
  if (error) {
    console.error('Unified terminal dashboard load failed:', error);
    return NextResponse.json({ error: 'Unified terminal settings could not be loaded.' }, { status: 500 });
  }
  return NextResponse.json({ capabilities: capabilities.data ?? [], merchants: merchants.data ?? [], plans: plans.data ?? [], entitlements: entitlements.data ?? [], transactions: transactions.data ?? [] });
}

export async function PUT(req: Request) {
  const context = await contextFor(req);
  if ('error' in context) return NextResponse.json({ error: context.error }, { status: context.status });
  if (context.role !== 'super_admin' && context.role !== 'admin') return NextResponse.json({ error: 'Administrator access is required to change terminal assignments.' }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const deviceId = typeof body.deviceId === 'string' ? body.deviceId : '';
  const profileKey = body.profileKey;
  const layoutKey = body.layoutKey;
  if (!/^[0-9a-f-]{36}$/i.test(deviceId) || !['GIMML_ONE', 'GIMML_MINI', 'CUSTOM'].includes(profileKey) || !['ONE', 'MINI'].includes(layoutKey)) {
    return NextResponse.json({ error: 'Choose a valid device, profile, and layout.' }, { status: 400 });
  }
  const terminal = context.admin.schema('gimml_terminal');
  const { data: device } = await terminal.from('devices').select('id').eq('id', deviceId).maybeSingle();
  if (!device) return NextResponse.json({ error: 'Device not found.' }, { status: 404 });
  const { error } = await terminal.from('device_profiles').upsert({ device_id: deviceId, profile_key: profileKey, layout_key: layoutKey, updated_at: new Date().toISOString() }, { onConflict: 'device_id' });
  if (error) {
    console.error('Unified terminal profile save failed:', error);
    return NextResponse.json({ error: 'Terminal profile could not be saved.' }, { status: 500 });
  }
  return NextResponse.json({ saved: true });
}

export async function POST(req: Request) {
  const context = await contextFor(req);
  if ('error' in context) return NextResponse.json({ error: context.error }, { status: context.status });
  if (context.role !== 'super_admin' && context.role !== 'admin') return NextResponse.json({ error: 'Administrator access is required to change entitlements.' }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const merchantId = typeof body.merchantId === 'string' ? body.merchantId : '';
  const deviceId = typeof body.deviceId === 'string' ? body.deviceId : '';
  const capabilityKey = typeof body.capabilityKey === 'string' ? body.capabilityKey : '';
  const enabled = body.enabled === true;
  if (!/^[0-9a-f-]{36}$/i.test(merchantId) || !/^[0-9a-f-]{36}$/i.test(deviceId) || !/^[A-Z0-9_:-]{2,64}$/.test(capabilityKey)) return NextResponse.json({ error: 'Choose a valid merchant, device, and feature.' }, { status: 400 });
  const terminal = context.admin.schema('gimml_terminal');
  const [{ data: device }, { data: item }] = await Promise.all([
    terminal.from('devices').select('id, merchant_id').eq('id', deviceId).eq('merchant_id', merchantId).maybeSingle(),
    terminal.from('catalog_items').select('sku, scope').eq('capability_key', capabilityKey).eq('active', true).limit(1).maybeSingle()
  ]);
  if (!device || !item) return NextResponse.json({ error: 'Device or catalog feature not found.' }, { status: 404 });
  const { data: existing } = await terminal.from('merchant_entitlements').select('id, state').eq('merchant_id', merchantId).eq('sku', item.sku).order('starts_at', { ascending: false }).limit(1).maybeSingle();
  if (!enabled) {
    if (existing) {
      await terminal.from('device_assignments').update({ revoked_at: new Date().toISOString() }).eq('entitlement_id', existing.id).eq('device_id', deviceId).is('revoked_at', null);
      if (item.scope === 'merchant') await terminal.from('merchant_entitlements').update({ state: 'suspended' }).eq('id', existing.id);
    }
    return NextResponse.json({ saved: true });
  }
  let entitlementId = existing?.id;
  if (!existing || !['active', 'trial', 'trialing', 'grace', 'past_due'].includes(existing.state)) {
    entitlementId = crypto.randomUUID();
    const { error } = await terminal.from('merchant_entitlements').insert({ id: entitlementId, merchant_id: merchantId, sku: item.sku, capability_key: capabilityKey, state: 'active', quantity: 1, starts_at: new Date().toISOString(), source: 'dashboard' });
    if (error) return NextResponse.json({ error: 'Feature entitlement could not be created.' }, { status: 500 });
  }
  if (item.scope === 'device') {
    const { data: activeAssignment } = await terminal.from('device_assignments').select('id').eq('entitlement_id', entitlementId).eq('device_id', deviceId).is('revoked_at', null).maybeSingle();
    if (!activeAssignment) {
      const { error } = await terminal.from('device_assignments').insert({ id: crypto.randomUUID(), entitlement_id: entitlementId, device_id: deviceId });
      if (error) return NextResponse.json({ error: 'Feature could not be assigned to the device.' }, { status: 500 });
    }
  }
  return NextResponse.json({ saved: true });
}

export async function PATCH(req: Request) {
  const context = await contextFor(req);
  if ('error' in context) return NextResponse.json({ error: context.error }, { status: context.status });
  if (context.role !== 'super_admin' && context.role !== 'admin') return NextResponse.json({ error: 'Administrator access is required to change prices.' }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const sku = typeof body.sku === 'string' ? body.sku : '';
  const cents = Number(body.unitPriceCents);
  if (!/^[A-Z0-9_:-]{2,100}$/.test(sku) || !Number.isSafeInteger(cents) || cents < 0 || cents > 100_000_000) return NextResponse.json({ error: 'Enter a valid non-negative price.' }, { status: 400 });
  const { error } = await context.admin.schema('gimml_terminal').from('catalog_items').update({ unit_price_cents: cents }).eq('sku', sku);
  if (error) return NextResponse.json({ error: 'Catalog price could not be saved.' }, { status: 500 });
  return NextResponse.json({ saved: true });
}
