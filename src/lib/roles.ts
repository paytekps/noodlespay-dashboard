export const userRoles = ['super_admin', 'admin', 'sales_rep', 'merchant'] as const;

export type UserRole = typeof userRoles[number];

const publicPaths = new Set(['/', '/login', '/how-it-works', '/pricing', '/signup', '/contact', '/order/success']);

export function isPublicPath(pathname: string) {
  return publicPaths.has(pathname) || pathname.startsWith('/device/');
}

export function isUserRole(value: unknown): value is UserRole {
  return typeof value === 'string' && userRoles.includes(value as UserRole);
}

export function landingPageForRole(role: UserRole) {
  if (role === 'super_admin' || role === 'admin') return '/admin';
  if (role === 'sales_rep') return '/sales';
  return '/dashboard';
}

export function canAccessPath(role: UserRole, pathname: string) {
  if (isPublicPath(pathname)) return true;

  if (pathname.startsWith('/admin/users')) {
    return role === 'super_admin';
  }

  if (role === 'super_admin' || role === 'admin') {
    return pathname.startsWith('/admin') ||
      pathname.startsWith('/dashboard/devices') ||
      pathname.startsWith('/dashboard/integrations') ||
      pathname.startsWith('/dashboard/settlements') ||
      pathname.startsWith('/transactions');
  }

  if (role === 'sales_rep') {
    return pathname.startsWith('/sales') ||
      pathname.startsWith('/dashboard/devices') ||
      pathname.startsWith('/dashboard/settlements') ||
      pathname.startsWith('/transactions');
  }

  return pathname === '/dashboard' ||
    pathname.startsWith('/dashboard/devices') ||
    pathname.startsWith('/dashboard/integrations') ||
    pathname.startsWith('/dashboard/settlements') ||
    pathname.startsWith('/transactions');
}

export function roleLabel(role: UserRole) {
  if (role === 'super_admin') return 'Owner';
  if (role === 'admin') return 'Administrator';
  if (role === 'sales_rep') return 'Sales representative';
  return 'Merchant';
}
