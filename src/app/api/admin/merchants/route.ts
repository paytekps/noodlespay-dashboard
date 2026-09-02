import { NextResponse } from 'next/server';
import { dashboardRequestContext, hasDashboardPermission } from '../../../../lib/dashboard-request';

const merchantColumns = 'id,name,slug,status,sales_rep_id,legal_business_name,dba_name,primary_contact_name,primary_contact_email,primary_contact_phone,address_line_1,address_line_2,city,state_region,postal_code,country_code,website,business_type,currency,timezone,billing_status,is_test,created_at';

async function managementContext(req: Request) {
  const context = await dashboardRequestContext(req);
  if ('error' in context) return context;
  if (!hasDashboardPermission(context, 'users.manage')) return { error: 'You do not have permission to manage merchants.', status: 403 };
  return context;
}

async function merchantList(context: Exclude<Awaited<ReturnType<typeof managementContext>>, { error: string; status: number }>) {
  const [{ data: merchants, error }, { data: salesReps, error: salesError }, { data: devices, error: devicesError }] = await Promise.all([
    context.admin.from('merchants').select(merchantColumns).order('name'),
    context.admin.from('sales_reps').select('id,name,email').order('name'),
    context.admin.from('devices').select('merchant_id,status')
  ]);
  if (error || salesError || devicesError) throw error || salesError || devicesError;
  const counts = new Map<string, { total: number; active: number }>();
  for (const device of devices ?? []) { if (!device.merchant_id) continue; const count = counts.get(device.merchant_id) ?? { total: 0, active: 0 }; count.total += 1; if (device.status === 'active') count.active += 1; counts.set(device.merchant_id, count); }
  return { merchants: (merchants ?? []).map(merchant => ({ ...merchant, device_count: counts.get(merchant.id)?.total ?? 0, active_device_count: counts.get(merchant.id)?.active ?? 0 })), salesRepresentatives: salesReps ?? [], owner: context.role === 'super_admin' };
}

export async function GET(req: Request) {
  const context = await managementContext(req);
  if ('error' in context) return NextResponse.json({ error: context.error }, { status: context.status });
  try { return NextResponse.json(await merchantList(context)); }
  catch (error) { console.error('Merchant management list failed:', error); return NextResponse.json({ error: 'Merchants could not be loaded.' }, { status: 500 }); }
}

export async function POST(req: Request) {
  const context = await managementContext(req);
  if ('error' in context) return NextResponse.json({ error: context.error }, { status: context.status });
  const body = await req.json().catch(() => ({}));
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const slug = typeof body.slug === 'string' ? body.slug.trim().toLowerCase() : '';
  if (!name || name.length > 160 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    return NextResponse.json({ error: 'Enter a merchant name and a valid dashboard address.' }, { status: 400 });
  }
  const { data, error } = await context.admin.rpc('dashboard_create_merchant', { p_details: { ...body, name, slug } });
  if (error) {
    console.error('Merchant creation failed:', error.code);
    const duplicate = error.code === '23505';
    return NextResponse.json({ error: duplicate ? 'That merchant name or dashboard address already exists.' : 'The merchant could not be created.' }, { status: duplicate ? 409 : 400 });
  }
  return NextResponse.json({ created: true, merchantId: data, ...(await merchantList(context)) });
}

export async function PATCH(req: Request) {
  const context = await managementContext(req);
  if ('error' in context) return NextResponse.json({ error: context.error }, { status: context.status });
  if (context.role !== 'super_admin') return NextResponse.json({ error: 'Only the Owner can change merchant operating status.' }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const merchantId = typeof body.merchantId === 'string' ? body.merchantId : '';
  const action = typeof body.action === 'string' ? body.action : '';
  if (!merchantId) return NextResponse.json({ error: 'Choose a merchant.' }, { status: 400 });
  const functions = { deactivate: 'dashboard_deactivate_merchant', reactivate: 'dashboard_reactivate_merchant', archive: 'dashboard_archive_merchant' } as const;
  if (!(action in functions)) return NextResponse.json({ error: 'Choose deactivate, reactivate, or archive.' }, { status: 400 });
  const functionName = functions[action as keyof typeof functions];
  const { data: affectedDevices, error } = await context.admin.rpc(functionName, { p_merchant_id: merchantId, p_actor_id: context.user.id });
  if (error) { console.error('Merchant status change failed:', action, error.code); return NextResponse.json({ error: 'The merchant status could not be changed.' }, { status: 400 }); }
  return NextResponse.json({ action, affectedDevices: affectedDevices ?? 0, ...(await merchantList(context)) });
}

export async function DELETE(req: Request) {
  const context = await managementContext(req);
  if ('error' in context) return NextResponse.json({ error: context.error }, { status: context.status });
  if (context.role !== 'super_admin') return NextResponse.json({ error: 'Only the Owner can permanently delete a test merchant.' }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const merchantId = typeof body.merchantId === 'string' ? body.merchantId : '';
  const confirmName = typeof body.confirmName === 'string' ? body.confirmName : '';
  if (!merchantId || !confirmName) return NextResponse.json({ error: 'Type the exact merchant name to confirm deletion.' }, { status: 400 });
  const { data: linkedUserIds, error } = await context.admin.rpc('dashboard_purge_empty_merchant', { p_merchant_id: merchantId, p_confirm_name: confirmName });
  if (error) {
    console.error('Merchant permanent deletion rejected:', error.code);
    const protectedHistory = error.message.includes('financial history');
    const notTest = error.message.includes('not designated as test');
    const mismatch = error.message.includes('confirmation');
    return NextResponse.json({ error: protectedHistory ? 'This merchant has payment, settlement, or external billing history and can only be archived.' : notTest ? 'Only a merchant explicitly designated as test can be permanently deleted.' : mismatch ? 'The merchant name does not match.' : 'The merchant could not be deleted.' }, { status: protectedHistory || notTest || mismatch ? 400 : 500 });
  }
  const authCleanupFailures: string[] = [];
  for (const userId of Array.isArray(linkedUserIds) ? linkedUserIds : []) {
    const first = await context.admin.auth.admin.deleteUser(userId);
    if (first.error) {
      const retry = await context.admin.auth.admin.deleteUser(userId);
      if (retry.error) authCleanupFailures.push(userId);
    }
  }
  if (authCleanupFailures.length) {
    console.error('Merchant auth cleanup requires attention:', authCleanupFailures);
    return NextResponse.json({ error: 'Merchant data was deleted, but one or more disabled login records require administrator cleanup.' }, { status: 500 });
  }
  return NextResponse.json({ deleted: true, ...(await merchantList(context)) });
}
