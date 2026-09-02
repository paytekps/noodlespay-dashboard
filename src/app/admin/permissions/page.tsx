'use client';

import { useEffect, useState } from 'react';
import { permissionIsLocked, lockedPermissionValue, type DashboardPermission } from '../../../lib/dashboard-permissions';
import type { UserRole } from '../../../lib/roles';
import { supabase } from '../../../lib/supabase';

type PermissionDefinition = { key: DashboardPermission; label: string; group: string };
const roles: Array<Exclude<UserRole, 'super_admin'>> = ['admin', 'sales_rep', 'merchant'];
const labels = { admin: 'Administrator', sales_rep: 'Sales representative', merchant: 'Merchant' };

export default function PermissionsPage() {
  const [catalog, setCatalog] = useState<PermissionDefinition[]>([]);
  const [values, setValues] = useState<Record<string, Set<string>>>({});
  const [token, setToken] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => { void (async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) { setMessage('Please sign in again.'); return; }
    setToken(session.access_token);
    const response = await fetch('/api/dashboard/access', { headers: { Authorization: `Bearer ${session.access_token}` }, cache: 'no-store' });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) { setMessage(payload.error ?? 'Permissions could not be loaded.'); return; }
    setCatalog(payload.catalog ?? []);
    setValues(Object.fromEntries(roles.map(role => [role, new Set(payload.rolePermissions?.[role] ?? [])])));
  })(); }, []);

  async function change(role: Exclude<UserRole, 'super_admin'>, permission: DashboardPermission, allowed: boolean) {
    const before = values[role] ?? new Set();
    const next = new Set(before);
    allowed ? next.add(permission) : next.delete(permission);
    setValues(current => ({ ...current, [role]: next }));
    setMessage('Saving…');
    const response = await fetch('/api/dashboard/access', {
      method: 'PUT', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ role, permission, allowed })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) { setValues(current => ({ ...current, [role]: new Set(before) })); setMessage(payload.error ?? 'Permission could not be saved.'); }
    else setMessage('Permission saved.');
  }

  const groups = [...new Set(catalog.map(item => item.group))];
  return <main className="mx-auto max-w-6xl p-10"><div><h1 className="text-3xl font-bold">Permissions</h1><p className="mt-2 text-gray-600">Choose what each user level can see or change. Owner access is always enabled. Pricing stays owner-only, and merchants can never manage processor or integration credentials.</p></div>
    {message && <div className="mt-4 text-sm text-gray-600" role="status">{message}</div>}
    <div className="mt-6 space-y-6">{groups.map(group => <section key={group} className="overflow-hidden rounded-xl border bg-white shadow-sm"><h2 className="border-b bg-gray-50 px-5 py-3 font-semibold">{group}</h2><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b"><th className="p-3">Dashboard item</th><th className="p-3 text-center">Owner</th>{roles.map(role => <th className="p-3 text-center" key={role}>{labels[role]}</th>)}</tr></thead><tbody>{catalog.filter(item => item.group === group).map(item => <tr className="border-b last:border-0" key={item.key}><td className="p-3 font-medium">{item.label}</td><td className="p-3 text-center"><input type="checkbox" checked readOnly aria-label={`Owner: ${item.label}`} /></td>{roles.map(role => { const locked = permissionIsLocked(role, item.key); const forced = lockedPermissionValue(role, item.key); const checked = forced ?? values[role]?.has(item.key) ?? false; return <td className="p-3 text-center" key={role}><input type="checkbox" checked={checked} disabled={locked} onChange={event => void change(role, item.key, event.target.checked)} aria-label={`${labels[role]}: ${item.label}`} />{locked && <div className="mt-1 text-xs text-gray-400">Locked</div>}</td>; })}</tr>)}</tbody></table></div></section>)}</div>
  </main>;
}
