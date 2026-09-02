import type { UserRole } from './roles';

export const dashboardPermissionCatalog = [
  { key: 'overview.view', label: 'View dashboard overview', group: 'Dashboard' },
  { key: 'devices.view', label: 'View devices and health', group: 'Devices' },
  { key: 'devices.configure', label: 'Change device settings', group: 'Devices' },
  { key: 'devices.enroll', label: 'Enroll and pair devices', group: 'Devices' },
  { key: 'plans.view', label: 'View plans and options', group: 'Plans & features' },
  { key: 'plans.select', label: 'Choose a plan', group: 'Plans & features' },
  { key: 'features.assign', label: 'Choose or assign device options', group: 'Plans & features' },
  { key: 'catalog.pricing.manage', label: 'Add products and change pricing', group: 'Plans & features', ownerOnly: true },
  { key: 'transactions.view', label: 'View transactions', group: 'Payments' },
  { key: 'transactions.actions', label: 'Request voids and refunds', group: 'Payments' },
  { key: 'batches.view', label: 'View batches and settlements', group: 'Payments' },
  { key: 'batches.manage', label: 'Run settlements', group: 'Payments' },
  { key: 'reports.view', label: 'View and export reports', group: 'Reporting' },
  { key: 'integrations.view', label: 'View integration status', group: 'Integrations' },
  { key: 'integrations.manage', label: 'Add or change integration credentials', group: 'Integrations', merchantDenied: true },
  { key: 'processor.view', label: 'View processor setup status', group: 'Processor' },
  { key: 'processor.manage', label: 'Change processor or VAR configuration', group: 'Processor', merchantDenied: true },
  { key: 'users.manage', label: 'Manage users and merchant assignments', group: 'Administration' },
  { key: 'sales.manage', label: 'Manage sales inquiries', group: 'Administration' },
  { key: 'audit.view', label: 'View audit and change history', group: 'Administration' },
  { key: 'permissions.manage', label: 'Change role permissions', group: 'Administration', ownerOnly: true }
] as const;

export type DashboardPermission = typeof dashboardPermissionCatalog[number]['key'];

const defaults: Record<UserRole, readonly DashboardPermission[]> = {
  super_admin: dashboardPermissionCatalog.map(item => item.key),
  admin: dashboardPermissionCatalog.filter(item => !('ownerOnly' in item && item.ownerOnly)).map(item => item.key),
  sales_rep: [
    'overview.view', 'devices.view', 'plans.view', 'transactions.view', 'batches.view',
    'reports.view', 'integrations.view', 'processor.view', 'audit.view'
  ],
  merchant: [
    'overview.view', 'devices.view', 'devices.configure', 'plans.view', 'plans.select',
    'features.assign', 'transactions.view', 'transactions.actions', 'batches.view',
    'batches.manage', 'reports.view', 'integrations.view', 'processor.view', 'audit.view'
  ]
};

export function defaultPermissions(role: UserRole) {
  return new Set(defaults[role]);
}

export function permissionIsLocked(role: UserRole, permission: DashboardPermission) {
  const definition = dashboardPermissionCatalog.find(item => item.key === permission);
  if (role === 'super_admin') return true;
  if (definition && 'ownerOnly' in definition && definition.ownerOnly) return true;
  if (role === 'merchant' && definition && 'merchantDenied' in definition && definition.merchantDenied) return true;
  return false;
}

export function lockedPermissionValue(role: UserRole, permission: DashboardPermission) {
  if (role === 'super_admin') return true;
  const definition = dashboardPermissionCatalog.find(item => item.key === permission);
  if (definition && 'ownerOnly' in definition && definition.ownerOnly) return false;
  if (role === 'merchant' && definition && 'merchantDenied' in definition && definition.merchantDenied) return false;
  return null;
}
