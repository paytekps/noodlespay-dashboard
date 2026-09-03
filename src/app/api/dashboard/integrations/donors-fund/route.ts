export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import {
  canAccessMerchant,
  dashboardRequestContext,
  hasDashboardPermission,
  type DashboardRequestContext
} from '../../../../../lib/dashboard-request';

type Integration = {
  merchant_id: string;
  credential_hint: string;
  organization_hint: string;
  organization_name: string | null;
  status: string;
  enabled: boolean;
  updated_at: string;
};

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

function canManage(context: DashboardRequestContext) {
  return context.role !== 'merchant' && hasDashboardPermission(context, 'integrations.manage');
}

async function merchantFor(context: DashboardRequestContext, value: unknown) {
  const id = typeof value === 'string' ? value.trim() : '';
  if (!id || !canAccessMerchant(context, id)) return null;
  const { data } = await context.admin.from('merchants').select('id, name, status').eq('id', id).maybeSingle();
  return data;
}

function publicStatus(integration: Integration | null | undefined) {
  if (!integration) return null;
  return {
    configured: Boolean(integration.enabled && integration.status !== 'disconnected'),
    token_hint: integration.credential_hint,
    charity_hint: integration.organization_hint,
    account_hint: integration.organization_name,
    status: integration.status,
    updated_at: integration.updated_at
  };
}

export async function GET(req: Request) {
  const context = await dashboardRequestContext(req);
  if ('error' in context) return json({ error: context.error }, context.status);
  if (!hasDashboardPermission(context, 'integrations.view')) return json({ error: 'You do not have permission to view integrations.' }, 403);

  let query = context.admin.from('merchants').select('id, name, status').order('name');
  if (context.merchantIds !== null) {
    if (!context.merchantIds.length) return json({ role: context.role, can_manage: false, merchants: [] });
    query = query.in('id', context.merchantIds);
  }
  const { data: merchants, error } = await query;
  if (error) return json({ error: 'Merchant setup could not be loaded.' }, 500);
  const ids = (merchants ?? []).map(item => item.id);
  const result = ids.length
    ? await context.admin.from('merchant_integrations').select('merchant_id, credential_hint, organization_hint, organization_name, status, enabled, updated_at').eq('provider', 'donors_fund').in('merchant_id', ids)
    : { data: [], error: null };
  if (result.error) return json({ error: 'The Donors Fund setup status could not be loaded.' }, 500);
  const byMerchant = new Map((result.data as Integration[]).map(item => [item.merchant_id, item]));
  return json({
    role: context.role,
    can_manage: canManage(context),
    merchants: (merchants ?? []).map(item => ({ ...item, integration: publicStatus(byMerchant.get(item.id)) }))
  });
}

export async function PUT(req: Request) {
  const context = await dashboardRequestContext(req);
  if ('error' in context) return json({ error: context.error }, context.status);
  if (!canManage(context)) return json({ error: 'Only authorized administrators can change integration credentials.' }, 403);
  const body = await req.json().catch(() => ({}));
  const merchant = await merchantFor(context, body.merchant_id);
  if (!merchant) return json({ error: 'Merchant was not found.' }, 404);
  const token = typeof body.validation_token === 'string' ? body.validation_token.trim() : '';
  const taxId = typeof body.tax_id === 'string' ? body.tax_id.replace(/\D/g, '') : '';
  const account = typeof body.account_number === 'string' ? body.account_number.replace(/\D/g, '') : '';
  if (!token || token.length > 2048 || /[\u0000-\u001f\u007f]/.test(token)) return json({ error: 'Enter a valid validation token.' }, 400);
  if (!/^\d{9}$/.test(taxId)) return json({ error: 'Enter the charity\'s 9-digit tax ID.' }, 400);
  if (!/^\d{7}$/.test(account)) return json({ error: 'Enter the 7-digit charity account number.' }, 400);
  const { data, error } = await context.admin.rpc('store_merchant_donors_fund_credential', {
    p_merchant_id: merchant.id,
    p_validation_token: token,
    p_tax_id: taxId,
    p_account_number: account,
    p_actor: context.user.id
  });
  if (error) {
    console.error('Donors Fund credential save failed:', error.code);
    return json({ error: 'The Donors Fund credentials could not be saved securely.' }, 500);
  }
  return json({ success: true, integration: publicStatus(data as Integration) });
}

export async function DELETE(req: Request) {
  const context = await dashboardRequestContext(req);
  if ('error' in context) return json({ error: context.error }, context.status);
  if (!canManage(context)) return json({ error: 'Only authorized administrators can change integration credentials.' }, 403);
  const body = await req.json().catch(() => ({}));
  const merchant = await merchantFor(context, body.merchant_id);
  if (!merchant) return json({ error: 'Merchant was not found.' }, 404);
  const { error } = await context.admin.rpc('disconnect_merchant_donors_fund_credential', {
    p_merchant_id: merchant.id,
    p_actor: context.user.id
  });
  if (error) return json({ error: 'The Donors Fund connection could not be removed.' }, 500);
  return json({ success: true });
}
