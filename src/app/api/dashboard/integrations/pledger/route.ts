export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import {
  canAccessMerchant,
  dashboardRequestContext,
  hasDashboardPermission,
  type DashboardRequestContext
} from '../../../../../lib/dashboard-request';

type MerchantIntegration = {
  merchant_id: string;
  credential_hint: string;
  organization_hint: string;
  organization_name: string | null;
  status: string;
  enabled: boolean;
  last_verified_at: string | null;
  last_verification_error: string | null;
  updated_at: string;
};

function json(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store' }
  });
}

function isError(
  context: Awaited<ReturnType<typeof dashboardRequestContext>>
): context is { error: string; status: number } {
  return 'error' in context;
}

function canManageIntegration(context: DashboardRequestContext) {
  return hasDashboardPermission(context, 'integrations.manage') && context.role !== 'merchant';
}

async function authorizedMerchant(
  context: DashboardRequestContext,
  merchantId: unknown
) {
  const id = typeof merchantId === 'string' ? merchantId.trim() : '';
  if (!id || !canAccessMerchant(context, id)) return null;

  const { data, error } = await context.admin
    .from('merchants')
    .select('id, name, status')
    .eq('id', id)
    .maybeSingle();

  if (error || !data) return null;
  return data;
}

function publicIntegration(integration: MerchantIntegration | null | undefined) {
  if (!integration) return null;
  return {
    configured: Boolean(integration.enabled && integration.status !== 'disconnected'),
    token_hint: integration.credential_hint,
    tax_id_hint: integration.organization_hint,
    charity_name: integration.organization_name,
    status: integration.status,
    last_verified_at: integration.last_verified_at,
    last_verification_error: integration.last_verification_error,
    updated_at: integration.updated_at
  };
}

export async function GET(req: Request) {
  const context = await dashboardRequestContext(req);
  if (isError(context)) return json({ error: context.error }, context.status);
  if (!hasDashboardPermission(context, 'integrations.view')) {
    return json({ error: 'You do not have permission to view integrations.' }, 403);
  }

  let merchantQuery = context.admin
    .from('merchants')
    .select('id, name, status')
    .order('name');
  if (context.merchantIds !== null) {
    if (context.merchantIds.length === 0) {
      return json({ role: context.role, merchants: [] });
    }
    merchantQuery = merchantQuery.in('id', context.merchantIds);
  }

  const { data: merchants, error: merchantError } = await merchantQuery;
  if (merchantError) {
    console.error('Pledger merchant list failed:', merchantError.code);
    return json({ error: 'Merchant setup could not be loaded.' }, 500);
  }

  const merchantIds = (merchants ?? []).map((merchant) => merchant.id);
  let integrations: MerchantIntegration[] = [];
  if (merchantIds.length) {
    const { data, error } = await context.admin
      .from('merchant_integrations')
      .select('merchant_id, credential_hint, organization_hint, organization_name, status, enabled, last_verified_at, last_verification_error, updated_at')
      .eq('provider', 'pledger')
      .in('merchant_id', merchantIds);
    if (error) {
      console.error('Pledger integration status lookup failed:', error.code);
      return json({ error: 'Pledger setup status could not be loaded.' }, 500);
    }
    integrations = (data ?? []) as MerchantIntegration[];
  }

  const integrationByMerchant = new Map(
    integrations.map((integration) => [integration.merchant_id, integration])
  );
  return json({
    role: context.role,
    can_manage: canManageIntegration(context),
    merchants: (merchants ?? []).map((merchant) => ({
      ...merchant,
      integration: publicIntegration(integrationByMerchant.get(merchant.id))
    }))
  });
}

export async function PUT(req: Request) {
  const context = await dashboardRequestContext(req);
  if (isError(context)) return json({ error: context.error }, context.status);
  if (!canManageIntegration(context)) {
    return json({ error: 'Only authorized administrators can change integration credentials.' }, 403);
  }

  const body = await req.json().catch(() => ({}));
  const merchant = await authorizedMerchant(context, body.merchant_id);
  if (!merchant) return json({ error: 'Merchant was not found.' }, 404);

  const apiToken = typeof body.api_token === 'string' ? body.api_token.trim() : '';
  const taxId = typeof body.tax_id === 'string' ? body.tax_id.replace(/\D/g, '') : '';
  const charityName = typeof body.charity_name === 'string' ? body.charity_name.trim() : '';

  if (!apiToken || apiToken.length > 2048 || /[\u0000-\u001f\u007f]/.test(apiToken)) {
    return json({ error: 'Enter a valid Pledger Bearer API token.' }, 400);
  }
  if (!/^\d{9}$/.test(taxId)) {
    return json({ error: 'Enter the charity\'s 9-digit tax ID.' }, 400);
  }
  if (!charityName || charityName.length > 254 || /[\u0000-\u001f\u007f]/.test(charityName)) {
    return json({ error: 'Enter the charity name registered with Pledger.' }, 400);
  }

  const { data, error } = await context.admin.rpc('store_merchant_pledger_credential', {
    p_merchant_id: merchant.id,
    p_api_token: apiToken,
    p_tax_id: taxId,
    p_charity_name: charityName,
    p_actor: context.user.id
  });
  if (error) {
    console.error('Pledger credential save failed:', error.code);
    return json({ error: 'The Pledger credentials could not be saved securely.' }, 500);
  }

  return json({
    success: true,
    merchant: { id: merchant.id, name: merchant.name },
    integration: publicIntegration(data as MerchantIntegration)
  });
}

export async function DELETE(req: Request) {
  const context = await dashboardRequestContext(req);
  if (isError(context)) return json({ error: context.error }, context.status);
  if (!canManageIntegration(context)) {
    return json({ error: 'Only authorized administrators can change integration credentials.' }, 403);
  }

  const body = await req.json().catch(() => ({}));
  const merchant = await authorizedMerchant(context, body.merchant_id);
  if (!merchant) return json({ error: 'Merchant was not found.' }, 404);

  const { error } = await context.admin.rpc('disconnect_merchant_pledger_credential', {
    p_merchant_id: merchant.id,
    p_actor: context.user.id
  });
  if (error) {
    console.error('Pledger credential disconnect failed:', error.code);
    return json({ error: 'The Pledger connection could not be removed.' }, 500);
  }

  return json({ success: true });
}
