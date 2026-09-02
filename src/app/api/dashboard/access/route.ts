import { NextResponse } from 'next/server';
import { dashboardPermissionCatalog, defaultPermissions, lockedPermissionValue, type DashboardPermission } from '../../../../lib/dashboard-permissions';
import { dashboardRequestContext } from '../../../../lib/dashboard-request';
import { userRoles, type UserRole } from '../../../../lib/roles';

const configurableRoles = userRoles.filter(role => role !== 'super_admin');

export async function GET(req: Request) {
  const context = await dashboardRequestContext(req);
  if ('error' in context) return NextResponse.json({ error: context.error }, { status: context.status });
  const response: Record<string, string[]> = {};
  if (context.role === 'super_admin') {
    const { data } = await context.admin.from('dashboard_role_permissions').select('role, permission_key, allowed');
    for (const role of configurableRoles) {
      const rows = (data ?? []).filter(row => row.role === role);
      response[role] = rows.length
        ? rows.filter(row => row.allowed).map(row => row.permission_key)
        : [...defaultPermissions(role)];
    }
  }
  return NextResponse.json({
    role: context.role,
    permissions: [...context.permissions],
    catalog: context.role === 'super_admin' ? dashboardPermissionCatalog : undefined,
    rolePermissions: context.role === 'super_admin' ? response : undefined
  });
}

export async function PUT(req: Request) {
  const context = await dashboardRequestContext(req);
  if ('error' in context) return NextResponse.json({ error: context.error }, { status: context.status });
  if (context.role !== 'super_admin') return NextResponse.json({ error: 'Only the owner can change role permissions.' }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const role = body.role as UserRole;
  const permission = body.permission as DashboardPermission;
  const allowed = body.allowed === true;
  if (!configurableRoles.includes(role as Exclude<UserRole, 'super_admin'>) || !dashboardPermissionCatalog.some(item => item.key === permission)) {
    return NextResponse.json({ error: 'Choose a valid role and permission.' }, { status: 400 });
  }
  const locked = lockedPermissionValue(role, permission);
  if (locked !== null && locked !== allowed) {
    return NextResponse.json({ error: 'This security rule is permanently locked.' }, { status: 400 });
  }
  const { error } = await context.admin.from('dashboard_role_permissions').upsert({
    role,
    permission_key: permission,
    allowed,
    updated_by: context.user.id,
    updated_at: new Date().toISOString()
  }, { onConflict: 'role,permission_key' });
  if (error) return NextResponse.json({ error: 'The permission could not be saved.' }, { status: 500 });
  return NextResponse.json({ saved: true });
}
