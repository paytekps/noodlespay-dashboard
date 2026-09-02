import 'server-only';

import type { SupabaseClient, User } from '@supabase/supabase-js';
import { createServiceClient, createUserRequestClient } from './server-supabase';
import type { UserRole } from './roles';
import { isUserRole } from './roles';
import { defaultPermissions, type DashboardPermission } from './dashboard-permissions';

export type DashboardRequestContext = {
  admin: SupabaseClient;
  user: User;
  role: UserRole;
  merchantIds: string[] | null;
  permissions: Set<DashboardPermission>;
};

async function permissionsForRole(admin: SupabaseClient, role: UserRole) {
  if (role === 'super_admin') return defaultPermissions(role);
  const fallback = defaultPermissions(role);
  const { data, error } = await admin
    .from('dashboard_role_permissions')
    .select('permission_key, allowed')
    .eq('role', role);
  if (error || !data?.length) return fallback;
  return new Set(data.filter(row => row.allowed).map(row => row.permission_key as DashboardPermission));
}

export async function dashboardRequestContext(
  req: Request
): Promise<DashboardRequestContext | { error: string; status: number }> {
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return { error: 'Please sign in again.', status: 401 };

  let admin: SupabaseClient;
  try {
    admin = createServiceClient();
  } catch {
    return { error: 'Dashboard access is not configured.', status: 503 };
  }

  const { data: { user }, error: userError } = await admin.auth.getUser(token);
  if (userError || !user) {
    return { error: 'Your session could not be verified.', status: 401 };
  }

  let requestClient: SupabaseClient;
  try {
    requestClient = createUserRequestClient(token);
  } catch {
    return { error: 'Dashboard access is not configured.', status: 503 };
  }

  const { data: profile, error: profileError } = await requestClient
    .from('profiles')
    .select('role, merchant_id')
    .eq('id', user.id)
    .maybeSingle();

  if (profileError || !profile || !isUserRole(profile.role)) {
    return { error: 'Your access profile could not be verified.', status: 403 };
  }
  const permissions = await permissionsForRole(admin, profile.role);

  if (profile.role === 'super_admin' || profile.role === 'admin') {
    return { admin, user, role: profile.role, merchantIds: null, permissions };
  }

  if (profile.role === 'merchant') {
    return {
      admin,
      user,
      role: profile.role,
      merchantIds: profile.merchant_id ? [profile.merchant_id] : [],
      permissions
    };
  }

  const { data: salesRep, error: repError } = await admin
    .from('sales_reps')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle();

  if (repError || !salesRep) {
    return { admin, user, role: profile.role, merchantIds: [], permissions };
  }

  const { data: assignments, error: assignmentError } = await admin
    .from('sales_rep_merchants')
    .select('merchant_id')
    .eq('sales_rep_id', salesRep.id);

  if (assignmentError) {
    return { error: 'Sales assignments could not be verified.', status: 500 };
  }

  return {
    admin,
    user,
    role: profile.role,
    permissions,
    merchantIds: (assignments ?? [])
      .map((assignment) => assignment.merchant_id)
      .filter((merchantId): merchantId is string => Boolean(merchantId))
  };
}

export function hasDashboardPermission(
  context: DashboardRequestContext,
  permission: DashboardPermission
) {
  return context.role === 'super_admin' || context.permissions.has(permission);
}

export function canAccessMerchant(
  context: DashboardRequestContext,
  merchantId: string
) {
  return context.merchantIds === null || context.merchantIds.includes(merchantId);
}
