import { NextResponse } from 'next/server';
import { createHmac, randomBytes } from 'node:crypto';
import { canAccessMerchant, dashboardRequestContext, hasDashboardPermission } from '../../../../lib/dashboard-request';
import { capabilityWorksWithLayout } from '../../../../lib/gimml-terminal-dashboard/compatibility';

async function contextFor(req: Request) {
  const context = await dashboardRequestContext(req);
  if ('error' in context) return context;
  if (!hasDashboardPermission(context, 'plans.view')) return { error: 'Terminal plans are not available to this role.', status: 403 };
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
  const normalizedMerchants = (merchants.data ?? []).map(merchant => ({
    ...merchant,
    devices: (merchant.devices ?? []).map(device => ({
      ...device,
      device_profiles: Array.isArray(device.device_profiles)
        ? device.device_profiles
        : device.device_profiles ? [device.device_profiles] : []
    }))
  }));
  return NextResponse.json({ capabilities: capabilities.data ?? [], merchants: normalizedMerchants, plans: plans.data ?? [], entitlements: entitlements.data ?? [], transactions: transactions.data ?? [] });
}

export async function PUT(req: Request) {
  const context = await contextFor(req);
  if ('error' in context) return NextResponse.json({ error: context.error }, { status: context.status });
  const body = await req.json().catch(() => ({}));
  const deviceId = typeof body.deviceId === 'string' ? body.deviceId : '';
  if (body.settings) {
    if (!hasDashboardPermission(context, 'devices.configure')) return NextResponse.json({ error: 'You do not have permission to change device settings.' }, { status: 403 });
    const settings = body.settings;
    const valid = /^[0-9a-f-]{36}$/i.test(deviceId)
      && Number.isSafeInteger(settings.default_cents) && settings.default_cents >= 0
      && Array.isArray(settings.preset_cents) && settings.preset_cents.length === 3
      && settings.preset_cents.every((value: unknown) => Number.isSafeInteger(value) && Number(value) >= 0)
      && Number.isSafeInteger(settings.increment_cents) && settings.increment_cents >= 0
      && Number.isSafeInteger(settings.maximum_cents) && settings.maximum_cents > 0
      && Number.isSafeInteger(settings.reset_seconds) && settings.reset_seconds >= 5 && settings.reset_seconds <= 300;
    if (!valid) return NextResponse.json({ error: 'Enter valid unified terminal settings.' }, { status: 400 });
    const terminal = context.admin.schema('gimml_terminal');
    const [{ data: device }, { data: deviceProfile }] = await Promise.all([
      terminal.from('devices').select('id, merchant_id').eq('id', deviceId).maybeSingle(),
      terminal.from('device_profiles').select('profile_key').eq('device_id', deviceId).maybeSingle()
    ]);
    if (!device) return NextResponse.json({ error: 'Unified terminal not found.' }, { status: 404 });
    if (!canAccessMerchant(context, device.merchant_id)) return NextResponse.json({ error: 'You cannot change settings for this merchant.' }, { status: 403 });
    const isMini = deviceProfile?.profile_key === 'GIMML_MINI';
    const normalized = {
      default_cents: isMini ? 0 : settings.default_cents,
      preset_cents: settings.preset_cents,
      increment_cents: isMini ? 0 : settings.increment_cents,
      maximum_cents: settings.maximum_cents,
      reset_seconds: settings.reset_seconds
    };
    const { data: existing } = await terminal.from('device_settings').select('device_id').eq('device_id', deviceId).eq('key', 'terminal').maybeSingle();
    const result = existing
      ? await terminal.from('device_settings').update({ value_json: normalized, updated_at: new Date().toISOString() }).eq('device_id', deviceId).eq('key', 'terminal')
      : await terminal.from('device_settings').insert({ device_id: deviceId, key: 'terminal', value_json: normalized, revision: 1 });
    if (result.error) {
      console.error('Unified terminal settings save failed:', result.error);
      return NextResponse.json({ error: 'Unified terminal settings could not be saved.' }, { status: 500 });
    }
    return NextResponse.json({ saved: true });
  }
  if (context.role !== 'admin' && context.role !== 'super_admin') {
    return NextResponse.json({ error: 'Only an administrator can assign a terminal profile.' }, { status: 403 });
  }
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
  if (!hasDashboardPermission(context, 'features.assign')) return NextResponse.json({ error: 'You do not have permission to change device options.' }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const merchantId = typeof body.merchantId === 'string' ? body.merchantId : '';
  const deviceId = typeof body.deviceId === 'string' ? body.deviceId : '';
  const capabilityKey = typeof body.capabilityKey === 'string' ? body.capabilityKey : '';
  const enabled = body.enabled === true;
  if (!/^[0-9a-f-]{36}$/i.test(merchantId) || !/^[0-9a-f-]{36}$/i.test(deviceId) || !/^[A-Z0-9_:-]{2,64}$/.test(capabilityKey)) return NextResponse.json({ error: 'Choose a valid merchant, device, and feature.' }, { status: 400 });
  if (!canAccessMerchant(context, merchantId)) return NextResponse.json({ error: 'You cannot change options for this merchant.' }, { status: 403 });
  const terminal = context.admin.schema('gimml_terminal');
  const [{ data: device }, { data: item }, { data: deviceProfile }] = await Promise.all([
    terminal.from('devices').select('id, merchant_id').eq('id', deviceId).eq('merchant_id', merchantId).maybeSingle(),
    terminal.from('catalog_items').select('sku, scope').eq('capability_key', capabilityKey).eq('active', true).limit(1).maybeSingle(),
    terminal.from('device_profiles').select('layout_key').eq('device_id', deviceId).maybeSingle()
  ]);
  if (!device || !item) return NextResponse.json({ error: 'Device or catalog feature not found.' }, { status: 404 });
  if (!deviceProfile || !capabilityWorksWithLayout(capabilityKey, deviceProfile.layout_key)) {
    return NextResponse.json({ error: 'This option is not available for the assigned terminal type.' }, { status: 400 });
  }
  const { data: existing } = await terminal.from('merchant_entitlements').select('id, state').eq('merchant_id', merchantId).eq('sku', item.sku).order('starts_at', { ascending: false }).limit(1).maybeSingle();
  if (!enabled) {
    if (existing) {
      const assignmentResult = await terminal.from('device_assignments').update({ revoked_at: new Date().toISOString() }).eq('entitlement_id', existing.id).eq('device_id', deviceId).is('revoked_at', null);
      if (assignmentResult.error) return NextResponse.json({ error: 'Feature assignment could not be removed.' }, { status: 500 });
      if (item.scope === 'merchant') {
        const entitlementResult = await terminal.from('merchant_entitlements').update({ state: 'suspended' }).eq('id', existing.id);
        if (entitlementResult.error) return NextResponse.json({ error: 'Merchant feature could not be disabled.' }, { status: 500 });
      }
    }
    const { error: revisionError } = await terminal.rpc('bump_device_revision', { p_device: deviceId });
    if (revisionError) return NextResponse.json({ error: 'The option was saved, but terminal synchronization could not be scheduled.' }, { status: 500 });
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
  const { error: revisionError } = await terminal.rpc('bump_device_revision', { p_device: deviceId });
  if (revisionError) return NextResponse.json({ error: 'The option was saved, but terminal synchronization could not be scheduled.' }, { status: 500 });
  return NextResponse.json({ saved: true });
}

export async function DELETE(req: Request) {
  const context = await contextFor(req);
  if ('error' in context) return NextResponse.json({ error: context.error }, { status: context.status });
  if (!hasDashboardPermission(context, 'devices.enroll')) return NextResponse.json({ error: 'You do not have permission to enroll devices.' }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const deviceId = typeof body.deviceId === 'string' ? body.deviceId : '';
  const applicationId = typeof body.applicationId === 'string' ? body.applicationId : '';
  const certificate = typeof body.signingCertificateSha256 === 'string' ? body.signingCertificateSha256.toLowerCase() : '';
  if (!/^[0-9a-f-]{36}$/i.test(deviceId) || !/^com\.gimml\.terminal(?:\.debug)?$/.test(applicationId) || !/^[a-f0-9]{64}$/.test(certificate)) return NextResponse.json({ error: 'The app identity is invalid.' }, { status: 400 });
  const pepper = process.env.GIMML_PAIRING_PEPPER;
  if (!pepper || pepper.length < 32) return NextResponse.json({ error: 'Pairing is not configured.' }, { status: 503 });
  const terminal = context.admin.schema('gimml_terminal');
  const { data: device } = await terminal.from('devices').select('id, serial_number').eq('id', deviceId).maybeSingle();
  if (!device) return NextResponse.json({ error: 'Device not found.' }, { status: 404 });
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const code = [...randomBytes(12)].map(value => alphabet[value % alphabet.length]).join('');
  const digest = createHmac('sha256', pepper).update(`${device.serial_number}\n${code}`).digest('hex');
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  await terminal.from('device_pairing_codes').update({ consumed_at: new Date().toISOString() }).eq('device_id', deviceId).is('consumed_at', null);
  const { error } = await terminal.from('device_pairing_codes').insert({ id: crypto.randomUUID(), device_id: deviceId, code_digest: `\\x${digest}`, expires_at: expiresAt, expected_application_id: applicationId, expected_signing_cert_sha256: `\\x${certificate}` });
  if (error) {
    console.error('Unified terminal pairing creation failed:', error);
    return NextResponse.json({ error: 'Pairing code could not be created.' }, { status: 500 });
  }
  return NextResponse.json({ pairingCode: code, expiresAt });
}

export async function PATCH(req: Request) {
  const context = await contextFor(req);
  if ('error' in context) return NextResponse.json({ error: context.error }, { status: context.status });
  if (context.role !== 'super_admin' || !hasDashboardPermission(context, 'catalog.pricing.manage')) return NextResponse.json({ error: 'Only the owner can add or change pricing.' }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const sku = typeof body.sku === 'string' ? body.sku : '';
  const cents = Number(body.unitPriceCents);
  if (!/^[A-Z0-9_:-]{2,100}$/.test(sku) || !Number.isSafeInteger(cents) || cents < 0 || cents > 100_000_000) return NextResponse.json({ error: 'Enter a valid non-negative price.' }, { status: 400 });
  const { error } = await context.admin.schema('gimml_terminal').from('catalog_items').update({ unit_price_cents: cents }).eq('sku', sku);
  if (error) return NextResponse.json({ error: 'Catalog price could not be saved.' }, { status: 500 });
  return NextResponse.json({ saved: true });
}
