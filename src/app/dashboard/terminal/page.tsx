'use client';

import { useEffect, useState } from 'react';
import { CapabilityCatalog } from '../../../components/terminal/capability-catalog';
import { MerchantSubscriptions } from '../../../components/terminal/merchant-subscriptions';
import { PlanOverview } from '../../../components/terminal/plan-overview';
import type { TerminalDashboardData } from '../../../lib/gimml-terminal-dashboard/types';
import { supabase } from '../../../lib/supabase';

export default function TerminalManagementPage() {
  const [data, setData] = useState<TerminalDashboardData | null>(null);
  const [token, setToken] = useState('');
  const [role, setRole] = useState('');
  const [permissions, setPermissions] = useState<Set<string>>(new Set());
  const [error, setError] = useState('');
  useEffect(() => { void (async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) { setError('Please sign in again.'); return; }
    setToken(session.access_token);
    const headers = { Authorization: `Bearer ${session.access_token}` };
    const [accessResponse, response] = await Promise.all([
      fetch('/api/dashboard/access', { headers, cache: 'no-store' }),
      fetch('/api/dashboard/terminal', { headers, cache: 'no-store' })
    ]);
    const access = await accessResponse.json().catch(() => ({}));
    const payload = await response.json().catch(() => ({}));
    if (!accessResponse.ok) setError(access.error ?? 'Dashboard permissions could not be loaded.');
    else if (!response.ok) setError(payload.error ?? 'Unified terminal settings could not be loaded.');
    else { setRole(access.role ?? ''); setPermissions(new Set(access.permissions ?? [])); setData(payload); }
  })(); }, []);
  if (error) return <main className="mx-auto max-w-6xl p-10"><h1 className="text-3xl font-bold">Gimml Terminal</h1><div className="mt-6 rounded border border-red-200 bg-red-50 p-4 text-red-800">{error}</div></main>;
  if (!data) return <main className="p-10">Loading Gimml Terminal settings…</main>;
  const isOwner = role === 'super_admin';
  const isAdministrator = role === 'admin' || isOwner;
  return <main className="mx-auto max-w-6xl space-y-6 p-10"><div><h1 className="text-3xl font-bold">Plans &amp; features</h1><p className="mt-2 text-gray-600">Terminal types, merchant subscriptions, compatible options, and owner pricing are separated below.</p></div>
    {isAdministrator ? <PlanOverview plans={data.plans} /> : null}
    <MerchantSubscriptions data={data} role={role} permissions={permissions} token={token} />
    {isOwner && permissions.has('catalog.pricing.manage') ? <CapabilityCatalog capabilities={data.capabilities} canEdit token={token} /> : null}
  </main>;
}
