import { NextResponse } from 'next/server';
import { dashboardRequestContext } from '../../../../lib/dashboard-request';
import { closedLoopTestProgram, closedLoopTestPrograms } from '../../../../lib/closed-loop-testing/programs';
import { matchConfiguredProgram, normalizeTestBin, providerNameMatches } from '../../../../lib/closed-loop-testing/simulator';

async function adminContext(req: Request) {
  const context = await dashboardRequestContext(req);
  if ('error' in context) return context;
  if (context.role !== 'admin' && context.role !== 'super_admin') return { error: 'Closed-loop testing is available only to administrators.', status: 403 };
  return context;
}

export async function GET(req: Request) {
  const context = await adminContext(req);
  if ('error' in context) return NextResponse.json({ error: context.error }, { status: context.status });
  const terminal = context.admin.schema('gimml_terminal');
  const [merchants, devices, programs, integrations] = await Promise.all([
    terminal.from('merchants').select('id,display_name').order('display_name'),
    terminal.from('devices').select('id,merchant_id,serial_number,enrollment_state').order('serial_number'),
    terminal.from('closed_loop_programs').select('id,merchant_id,display_name,bin_prefix,enabled').order('display_name'),
    context.admin.from('merchant_integrations').select('merchant_id,provider,status,enabled,last_verified_at,last_verification_error')
  ]);
  const error = merchants.error || devices.error || programs.error || integrations.error;
  if (error) return NextResponse.json({ error: 'Closed-loop test configuration could not be loaded.' }, { status: 500 });
  return NextResponse.json({ merchants: merchants.data ?? [], devices: devices.data ?? [], configuredPrograms: programs.data ?? [], integrations: integrations.data ?? [], testPrograms: closedLoopTestPrograms });
}

export async function POST(req: Request) {
  const context = await adminContext(req);
  if ('error' in context) return NextResponse.json({ error: context.error }, { status: context.status });
  const body = await req.json().catch(() => ({}));
  const merchantId = typeof body.merchantId === 'string' ? body.merchantId : '';
  const deviceId = typeof body.deviceId === 'string' ? body.deviceId : '';
  const providerKey = typeof body.providerKey === 'string' ? body.providerKey : '';
  const testBin = normalizeTestBin(body.testBin);
  const amountMinor = Number(body.amountMinor);
  const provider = closedLoopTestProgram(providerKey);
  if (!provider || !/^[0-9a-f-]{36}$/i.test(merchantId) || !/^[0-9a-f-]{36}$/i.test(deviceId) || testBin.length < 6 || !Number.isSafeInteger(amountMinor) || amountMinor < 1 || amountMinor > 100_000_000) {
    return NextResponse.json({ error: 'Choose a merchant, device, program, valid 6–8 digit test BIN, and positive test amount.' }, { status: 400 });
  }

  const terminal = context.admin.schema('gimml_terminal');
  const [{ data: device }, { data: programs }, { data: integration }, { data: entitlement }] = await Promise.all([
    terminal.from('devices').select('id,serial_number,enrollment_state').eq('id', deviceId).eq('merchant_id', merchantId).maybeSingle(),
    terminal.from('closed_loop_programs').select('id,display_name,bin_prefix,enabled').eq('merchant_id', merchantId),
    providerKey === 'donors_fund' ? Promise.resolve({ data: null }) : context.admin.from('merchant_integrations').select('provider,status,enabled,last_verified_at').eq('merchant_id', merchantId).eq('provider', providerKey).maybeSingle(),
    terminal.from('merchant_entitlements').select('id,state').eq('merchant_id', merchantId).eq('capability_key', 'CLOSED_LOOP_IDENTIFY').in('state', ['active','trial','trialing','grace','past_due']).limit(1).maybeSingle()
  ]);
  if (!device) return NextResponse.json({ error: 'The selected combined Datecs device was not found.' }, { status: 404 });
  const matched = matchConfiguredProgram(testBin, programs ?? []);
  const checks = [
    { key: 'device', label: 'Combined Datecs device is assigned', passed: true, detail: `${device.serial_number} is ${device.enrollment_state}.` },
    { key: 'entitlement', label: 'Closed-loop identification is entitled', passed: Boolean(entitlement), detail: entitlement ? `Entitlement is ${entitlement.state}.` : 'Enable Closed-loop identification for this merchant.' },
    { key: 'bin', label: 'Simulated BIN matches an enabled program', passed: Boolean(matched), detail: matched ? `Matched ${matched.display_name} using prefix ${matched.bin_prefix}.` : 'No enabled merchant program matches this test BIN.' },
    { key: 'routing', label: 'Matched program routes to the selected provider', passed: Boolean(matched && providerNameMatches(matched.display_name, providerKey)), detail: matched && providerNameMatches(matched.display_name, providerKey) ? `Would route to ${provider.name}.` : `The matched program name must identify ${provider.name}.` },
    { key: 'credentials', label: 'Provider connection is configured', passed: providerKey === 'donors_fund' ? false : Boolean(integration?.enabled && ['configured','verified'].includes(integration.status)), detail: providerKey === 'donors_fund' ? 'The Donors Fund adapter and credential setup are still pending.' : integration ? `Connection status: ${integration.status}.` : 'No provider connection is configured for this merchant.' },
    { key: 'isolation', label: 'No live payment or production report was created', passed: true, detail: `Dry run only for $${(amountMinor / 100).toFixed(2)}; no card data was used or stored.` },
    { key: 'datecs', label: 'Physical Datecs BIN recognition', passed: false, blocked: true, detail: 'Blocked until Datecs returns the verified BIN/card identifier.' }
  ];
  return NextResponse.json({ provider: provider.name, matchedProgram: matched?.display_name ?? null, testBin, amountMinor, checks, passed: checks.filter(check => !('blocked' in check && check.blocked)).every(check => check.passed), dryRun: true });
}
