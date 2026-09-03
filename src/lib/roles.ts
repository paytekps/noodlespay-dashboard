export const userRoles = ['super_admin', 'admin', 'sales_rep', 'merchant'] as const;

export type UserRole = typeof userRoles[number];

const publicPaths = new Set(['/', '/login', '/how-it-works', '/pricing', '/signup', '/contact', '/order/success']);

export function isPublicPath(pathname: string) {
  return publicPaths.has(pathname);
}

export function isUserRole(value: unknown): value is UserRole {
  return typeof value === 'string' && userRoles.includes(value as UserRole);
}

export function landingPageForRole(role: UserRole) {
  if (role === 'super_admin' || role === 'admin') return '/admin';
  if (role === 'sales_rep') return '/sales';
  return '/dashboard';
}

type PermissionSet = ReadonlySet<string>;

function hasPermission(permissions: PermissionSet | undefined, permission: string) {
  return permissions ? permissions.has(permission) : false;
}

export function landingPageForAccess(role: UserRole, permissions: ReadonlySet<string>) {
  const overview = landingPageForRole(role);
  const candidates = [
    overview,
    '/dashboard/devices',
    '/dashboard/terminal',
    '/transactions',
    '/dashboard/settlements',
    '/dashboard/integrations',
    '/admin/merchants',
    '/admin/users',
    '/admin/inquiries',
    '/admin/closed-loop-tests',
    '/admin/permissions'
  ];
  return candidates.find(path => canAccessPath(role, path, permissions)) ?? '/';
}

export function canAccessPath(role: UserRole, pathname: string, permissions?: PermissionSet) {
  if (isPublicPath(pathname)) return true;

  if (pathname.startsWith('/admin/permissions')) {
    return role === 'super_admin' && hasPermission(permissions, 'permissions.manage');
  }
  if (pathname.startsWith('/admin/users')) return hasPermission(permissions, 'users.manage');
  if (pathname.startsWith('/admin/merchants') || pathname.startsWith('/admin/merchant/')) return hasPermission(permissions, 'users.manage');
  if (pathname.startsWith('/admin/closed-loop-tests')) return hasPermission(permissions, 'integrations.manage');
  if (pathname.startsWith('/admin/inquiries')) return hasPermission(permissions, 'sales.manage');
  if (pathname === '/admin' || pathname === '/sales' || pathname === '/dashboard') return hasPermission(permissions, 'overview.view');
  if (/^\/dashboard\/devices\/[^/]+\/setup(?:\/|$)/.test(pathname)) return hasPermission(permissions, 'processor.manage');
  if (pathname.startsWith('/dashboard/devices')) return hasPermission(permissions, 'devices.view');
  if (pathname.startsWith('/dashboard/terminal')) return hasPermission(permissions, 'plans.view');
  if (pathname.startsWith('/dashboard/integrations')) return hasPermission(permissions, 'integrations.view');
  if (pathname.startsWith('/dashboard/settlements')) return hasPermission(permissions, 'batches.view');
  if (pathname.startsWith('/transactions')) return hasPermission(permissions, 'transactions.view');
  return false;
}

export function roleLabel(role: UserRole) {
  if (role === 'super_admin') return 'Owner';
  if (role === 'admin') return 'Administrator';
  if (role === 'sales_rep') return 'Sales representative';
  return 'Merchant';
}
