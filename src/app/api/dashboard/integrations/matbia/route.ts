export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import {
  canAccessMerchant,
  dashboardRequestContext,
  type DashboardRequestContext
} from '../../../../../lib/dashboard-request';

type MerchantIntegration = {
  merchant_id: string;
  credential_hint: string;
  organization_hint: string;
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
  return context.role === 'merchant'
    || context.role === 'admin'
    || context.role === 'super_admin';
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
    organization_key_hint: integration.organization_hint,
    status: integration.status,
    last_verified_at: integration.last_verified_at,
    last_verification_error: integration.last_verification_error,
    updated_at: integration.updated_at
  };
}

export async function GET(req: Request) {
  const context = await dashboardRequestContext(req);
  if (isError(context)) return json({ error: context.error }, context.status);
  if (!canManageIntegration(context)) {
    return json({ error: 'Merchant or administrator access is required.' }, 403);
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
    console.error('Matbia merchant list failed:', merchantError.code);
    return json({ error: 'Merchant setup could not be loaded.' }, 500);
  }

  const merchantIds = (merchants ?? []).map((merchant) => merchant.id);
  let integrations: MerchantIntegration[] = [];
  if (merchantIds.length) {
    const { data, error } = await context.admin
      .from('merchant_integrations')
      .select('merchant_id, credential_hint, organization_hint, status, enabled, last_verified_at, last_verification_error, updated_at')
      .eq('provider', 'matbia')
      .in('merchant_id', merchantIds);
    if (error) {
      console.error('Matbia integration status lookup failed:', error.code);
      return json({ error: 'Matbia setup status could not be loaded.' }, 500);
    }
    integrations = (data ?? []) as MerchantIntegration[];
  }

  const integrationByMerchant = new Map(
    integrations.map((integration) => [integration.merchant_id, integration])
  );
  return json({
    role: context.role,
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
    return json({ error: 'Merchant or administrator access is required.' }, 403);
  }

  const body: unknown = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return json({ error: 'Enter the Matbia connection details.' }, 400);
  }
  const payload = body as Record<string, unknown>;
  const merchant = await authorizedMerchant(context, payload.merchant_id);
  if (!merchant) return json({ error: 'Merchant was not found.' }, 404);

  const authorizationToken = typeof payload.authorization_token === 'string'
    ? payload.authorization_token.trim()
    : '';
  const organizationKey = typeof payload.org_user_handle === 'string'
    ? payload.org_user_handle.trim()
    : '';

  if (!authorizationToken || authorizationToken.length > 2048 || /[\u0000-\u001f\u007f]/.test(authorizationToken)) {
    return json({ error: 'Enter a valid Matbia authorization token.' }, 400);
  }
  if (!organizationKey || organizationKey.length > 500 || /[\u0000-\u001f\u007f]/.test(organizationKey)) {
    return json({ error: 'Enter the Matbia organization API key.' }, 400);
  }

  const { data, error } = await context.admin.rpc('store_merchant_matbia_credential', {
    p_merchant_id: merchant.id,
    p_authorization_token: authorizationToken,
    p_org_user_handle: organizationKey,
    p_actor: context.user.id
  });
  if (error) {
    console.error('Matbia credential save failed:', error.code);
    return json({ error: 'The Matbia credentials could not be saved securely.' }, 500);
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
    return json({ error: 'Merchant or administrator access is required.' }, 403);
  }

  const body: unknown = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return json({ error: 'Select a merchant.' }, 400);
  }
  const merchant = await authorizedMerchant(
    context,
    (body as Record<string, unknown>).merchant_id
  );
  if (!merchant) return json({ error: 'Merchant was not found.' }, 404);

  const { error } = await context.admin.rpc('disconnect_merchant_matbia_credential', {
    p_merchant_id: merchant.id,
    p_actor: context.user.id
  });
  if (error) {
    console.error('Matbia credential disconnect failed:', error.code);
    return json({ error: 'The Matbia connection could not be removed.' }, 500);
  }

  return json({ success: true });
}
