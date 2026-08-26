import 'server-only';

import type { SupabaseClient, User } from '@supabase/supabase-js';
import { createServiceClient, createUserRequestClient } from './server-supabase';
import type { UserRole } from './roles';
import { isUserRole } from './roles';

export type DashboardRequestContext = {
  admin: SupabaseClient;
  user: User;
  role: UserRole;
  merchantIds: string[] | null;
};

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

  if (profile.role === 'super_admin' || profile.role === 'admin') {
    return { admin, user, role: profile.role, merchantIds: null };
  }

  if (profile.role === 'merchant') {
    return {
      admin,
      user,
      role: profile.role,
      merchantIds: profile.merchant_id ? [profile.merchant_id] : []
    };
  }

  const { data: salesRep, error: repError } = await admin
    .from('sales_reps')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle();

  if (repError || !salesRep) {
    return { admin, user, role: profile.role, merchantIds: [] };
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
    merchantIds: (assignments ?? [])
      .map((assignment) => assignment.merchant_id)
      .filter((merchantId): merchantId is string => Boolean(merchantId))
  };
}

export function canAccessMerchant(
  context: DashboardRequestContext,
  merchantId: string
) {
  return context.merchantIds === null || context.merchantIds.includes(merchantId);
}
