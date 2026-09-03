import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { dashboardRequestContext } from '../../../../lib/dashboard-request';

const roles = ['super_admin', 'admin', 'sales_rep', 'merchant'] as const;
type ManagedRole = typeof roles[number];

function isManagedRole(value: unknown): value is ManagedRole {
  return typeof value === 'string' && roles.includes(value as ManagedRole);
}

async function ownerContext(req: Request) {
  const context = await dashboardRequestContext(req);
  if ('error' in context) return context;
  if (context.role !== 'super_admin') {
    return { error: 'Only the Owner can manage user access.', status: 403 };
  }
  return { admin: context.admin, userId: context.user.id };
}

async function listUsers(admin: SupabaseClient) {
  const [
    { data: profiles, error },
    { data: merchants },
    { data: salesReps },
    { data: assignments }
  ] = await Promise.all([
    admin.from('profiles').select('id, email, full_name, role, merchant_id').order('created_at'),
    admin.from('merchants').select('id, name').order('name'),
    admin.from('sales_reps').select('id, user_id'),
    admin.from('sales_rep_merchants').select('sales_rep_id, merchant_id')
  ]);

  if (error) throw error;
  const repByUser = new Map((salesReps ?? []).map((rep) => [rep.user_id, rep.id]));
  const merchantsByRep = new Map<string, string[]>();
  for (const assignment of assignments ?? []) {
    const current = merchantsByRep.get(assignment.sales_rep_id) ?? [];
    current.push(assignment.merchant_id);
    merchantsByRep.set(assignment.sales_rep_id, current);
  }

  const users = (profiles ?? []).map((profile) => {
    const repId = repByUser.get(profile.id);
    return {
      ...profile,
      assigned_merchant_ids: repId ? merchantsByRep.get(repId) ?? [] : []
    };
  });

  return { users, merchants: merchants ?? [] };
}

async function syncSalesAccess(
  admin: SupabaseClient,
  user: { id: string; email: string | null; fullName?: string | null },
  role: ManagedRole,
  merchantIds: string[]
) {
  const { data: existingRep, error: lookupError } = await admin
    .from('sales_reps')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle();
  if (lookupError) throw lookupError;

  let repId = existingRep?.id;
  if (role === 'sales_rep' && !repId) {
    const { data: createdRep, error: createError } = await admin
      .from('sales_reps')
      .insert({ user_id: user.id, email: user.email, name: user.fullName || user.email })
      .select('id')
      .single();
    if (createError) throw createError;
    repId = createdRep.id;
  }

  if (!repId) return;
  const { error: clearError } = await admin
    .from('sales_rep_merchants')
    .delete()
    .eq('sales_rep_id', repId);
  if (clearError) throw clearError;

  if (role === 'sales_rep' && merchantIds.length) {
    const { error: assignError } = await admin
      .from('sales_rep_merchants')
      .insert(merchantIds.map((merchantId) => ({ sales_rep_id: repId, merchant_id: merchantId })));
    if (assignError) throw assignError;
  }
}

function requestedMerchantIds(value: unknown) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((id): id is string => typeof id === 'string' && id.length > 0))];
}

export async function GET(req: Request) {
  const context = await ownerContext(req);
  if ('error' in context) {
    return NextResponse.json({ error: context.error }, { status: context.status });
  }

  try {
    return NextResponse.json({ ...(await listUsers(context.admin)), currentUserId: context.userId });
  } catch (error) {
    console.error('Owner user list failed:', error);
    return NextResponse.json({ error: 'Users could not be loaded.' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const context = await ownerContext(req);
  if ('error' in context) {
    return NextResponse.json({ error: context.error }, { status: context.status });
  }

  const body = await req.json().catch(() => ({}));
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const fullName = typeof body.fullName === 'string' ? body.fullName.trim().slice(0, 120) : '';
  const role = body.role;
  const merchantId = typeof body.merchantId === 'string' && body.merchantId ? body.merchantId : null;
  const merchantIds = requestedMerchantIds(body.merchantIds);

  if (!email || !email.includes('@')) {
    return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 });
  }
  if (!isManagedRole(role) || role === 'super_admin') {
    return NextResponse.json({ error: 'New users must start as Admin, Sales, or Merchant.' }, { status: 400 });
  }
  if (role === 'merchant' && !merchantId) {
    return NextResponse.json({ error: 'Select a merchant for a Merchant user.' }, { status: 400 });
  }

  const { data: invitation, error: inviteError } = await context.admin.auth.admin.inviteUserByEmail(
    email,
    { data: { full_name: fullName || undefined } }
  );
  if (inviteError || !invitation.user) {
    return NextResponse.json({ error: inviteError?.message || 'Invitation could not be sent.' }, { status: 400 });
  }

  const profile = {
    id: invitation.user.id,
    email,
    full_name: fullName || null,
    role,
    merchant_id: role === 'merchant' ? merchantId : null
  };
  const { error: profileError } = await context.admin.from('profiles').upsert(profile, { onConflict: 'id' });
  if (profileError) {
    await context.admin.auth.admin.deleteUser(invitation.user.id);
    return NextResponse.json({ error: 'The profile could not be created; the invitation was cancelled.' }, { status: 500 });
  }

  const { error: metadataError } = await context.admin.auth.admin.updateUserById(
    invitation.user.id,
    { app_metadata: { user_role: role } }
  );
  if (metadataError) {
    console.error('Invited user metadata sync failed:', metadataError);
  }

  try {
    await syncSalesAccess(context.admin, { id: invitation.user.id, email, fullName }, role, merchantIds);
  } catch (salesError) {
    console.error('Invited sales access sync failed:', salesError);
    return NextResponse.json({ error: 'The account was created, but its sales assignments could not be saved.' }, { status: 500 });
  }

  return NextResponse.json({ ...(await listUsers(context.admin)), currentUserId: context.userId });
}

export async function PATCH(req: Request) {
  const context = await ownerContext(req);
  if ('error' in context) {
    return NextResponse.json({ error: context.error }, { status: context.status });
  }

  const body = await req.json().catch(() => ({}));
  const userId = typeof body.userId === 'string' ? body.userId : '';
  const role = body.role;
  const merchantId = typeof body.merchantId === 'string' && body.merchantId ? body.merchantId : null;
  const merchantIds = requestedMerchantIds(body.merchantIds);

  if (!userId || !isManagedRole(role)) {
    return NextResponse.json({ error: 'Invalid user or role.' }, { status: 400 });
  }
  if (userId === context.userId) {
    return NextResponse.json({ error: 'Your own Owner role cannot be changed here.' }, { status: 400 });
  }
  if (role === 'merchant' && !merchantId) {
    return NextResponse.json({ error: 'Select a merchant for a Merchant user.' }, { status: 400 });
  }

  const { data: previous, error: lookupError } = await context.admin
    .from('profiles')
    .select('role, merchant_id')
    .eq('id', userId)
    .maybeSingle();
  if (lookupError || !previous) {
    return NextResponse.json({ error: 'User profile was not found.' }, { status: 404 });
  }

  if (previous.role === 'super_admin' && role !== 'super_admin') {
    const { count } = await context.admin
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('role', 'super_admin');
    if ((count ?? 0) <= 1) {
      return NextResponse.json({ error: 'The last Owner cannot be removed.' }, { status: 400 });
    }
  }

  const nextMerchantId = role === 'merchant' ? merchantId : null;
  const { error: updateError } = await context.admin
    .from('profiles')
    .update({ role, merchant_id: nextMerchantId })
    .eq('id', userId);
  if (updateError) {
    return NextResponse.json({ error: 'The profile could not be updated.' }, { status: 500 });
  }

  const { error: authError } = await context.admin.auth.admin.updateUserById(
    userId,
    { app_metadata: { user_role: role } }
  );
  if (authError) {
    await context.admin
      .from('profiles')
      .update({ role: previous.role, merchant_id: previous.merchant_id })
      .eq('id', userId);
    return NextResponse.json({ error: 'Auth permissions could not be updated.' }, { status: 500 });
  }

  try {
    const { data: targetProfile } = await context.admin
      .from('profiles')
      .select('email, full_name')
      .eq('id', userId)
      .single();
    await syncSalesAccess(
      context.admin,
      { id: userId, email: targetProfile?.email ?? null, fullName: targetProfile?.full_name ?? null },
      role,
      merchantIds
    );
  } catch (salesError) {
    console.error('Sales access sync failed:', salesError);
    return NextResponse.json({ error: 'The role was saved, but sales assignments could not be updated.' }, { status: 500 });
  }

  return NextResponse.json({ ...(await listUsers(context.admin)), currentUserId: context.userId });
}
