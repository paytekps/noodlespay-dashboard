import { NextResponse } from 'next/server';
import { dashboardRequestContext, hasDashboardPermission } from '../../../../lib/dashboard-request';

const merchantColumns = 'id,name,slug,status,sales_rep_id,legal_business_name,dba_name,primary_contact_name,primary_contact_email,primary_contact_phone,address_line_1,address_line_2,city,state_region,postal_code,country_code,website,business_type,currency,timezone,billing_status,created_at';

async function managementContext(req: Request) {
  const context = await dashboardRequestContext(req);
  if ('error' in context) return context;
  if (!hasDashboardPermission(context, 'users.manage')) return { error: 'You do not have permission to manage merchants.', status: 403 };
  return context;
}

async function merchantList(context: Exclude<Awaited<ReturnType<typeof managementContext>>, { error: string; status: number }>) {
  const [{ data: merchants, error }, { data: salesReps, error: salesError }] = await Promise.all([
    context.admin.from('merchants').select(merchantColumns).order('name'),
    context.admin.from('sales_reps').select('id,name,email').order('name')
  ]);
  if (error || salesError) throw error || salesError;
  return { merchants: merchants ?? [], salesRepresentatives: salesReps ?? [], owner: context.role === 'super_admin' };
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
  if (context.role !== 'super_admin') return NextResponse.json({ error: 'Only the Owner can archive a merchant.' }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const merchantId = typeof body.merchantId === 'string' ? body.merchantId : '';
  if (!merchantId) return NextResponse.json({ error: 'Choose a merchant.' }, { status: 400 });
  const { error } = await context.admin.rpc('dashboard_archive_merchant', { p_merchant_id: merchantId, p_actor_id: context.user.id });
  if (error) { console.error('Merchant archive failed:', error.code); return NextResponse.json({ error: 'The merchant could not be archived.' }, { status: 400 }); }
  return NextResponse.json({ archived: true, ...(await merchantList(context)) });
}

export async function DELETE(req: Request) {
  const context = await managementContext(req);
  if ('error' in context) return NextResponse.json({ error: context.error }, { status: context.status });
  if (context.role !== 'super_admin') return NextResponse.json({ error: 'Only the Owner can permanently delete a test merchant.' }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const merchantId = typeof body.merchantId === 'string' ? body.merchantId : '';
  const confirmName = typeof body.confirmName === 'string' ? body.confirmName : '';
  if (!merchantId || !confirmName) return NextResponse.json({ error: 'Type the exact merchant name to confirm deletion.' }, { status: 400 });
  const { data: linkedUserIds, error } = await context.admin.rpc('dashboard_purge_test_merchant', { p_merchant_id: merchantId, p_confirm_name: confirmName });
  if (error) {
    console.error('Merchant permanent deletion rejected:', error.code);
    const protectedHistory = error.message.includes('financial history');
    const mismatch = error.message.includes('confirmation');
    return NextResponse.json({ error: protectedHistory ? 'This merchant has payment, settlement, or external billing history and can only be archived.' : mismatch ? 'The merchant name does not match.' : 'The test merchant could not be deleted.' }, { status: protectedHistory || mismatch ? 400 : 500 });
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

