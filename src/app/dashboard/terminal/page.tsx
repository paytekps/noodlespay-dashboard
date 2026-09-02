'use client';

import { useEffect, useState } from 'react';
import { CapabilityCatalog } from '../../../components/terminal/capability-catalog';
import { DeviceProfileCard } from '../../../components/terminal/device-profile-card';
import { EntitlementEditor } from '../../../components/terminal/entitlement-editor';
import { TerminalReport } from '../../../components/terminal/terminal-report';
import type { TerminalDashboardData } from '../../../lib/gimml-terminal-dashboard/types';
import { supabase } from '../../../lib/supabase';

export default function TerminalManagementPage() {
  const [data, setData] = useState<TerminalDashboardData | null>(null);
  const [token, setToken] = useState('');
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
    else { setPermissions(new Set(access.permissions ?? [])); setData(payload); }
  })(); }, []);
  if (error) return <main className="mx-auto max-w-6xl p-10"><h1 className="text-3xl font-bold">Gimml Terminal</h1><div className="mt-6 rounded border border-red-200 bg-red-50 p-4 text-red-800">{error}</div></main>;
  if (!data) return <main className="p-10">Loading Gimml Terminal settings…</main>;
  return <main className="mx-auto max-w-6xl space-y-6 p-10"><div><h1 className="text-3xl font-bold">Plans &amp; features</h1><p className="mt-2 text-gray-600">Configure the combined Gimml Terminal. One and Mini are profiles within this single application.</p></div>
    <section className="rounded-xl border bg-white p-6 shadow-sm"><h2 className="text-xl font-semibold">Datecs devices</h2><p className="mt-1 text-sm text-gray-600">Only devices enrolled or prepared for the combined Gimml Terminal are shown here.</p><div className="mt-4 space-y-5">{data.merchants.map(merchant => <div key={merchant.id}><div className="mb-2 flex justify-between"><h3 className="font-semibold">{merchant.display_name}</h3><span className="text-sm text-gray-500">Billing: {merchant.billing_status}</span></div><div className="grid gap-3 lg:grid-cols-2">{merchant.devices.filter(device => /^6459/.test(device.serial_number)).map(device => <div className="rounded-lg border p-4" key={device.id}><DeviceProfileCard device={device} canConfigure={permissions.has('devices.configure')} canEnroll={permissions.has('devices.enroll')} token={token} debugCertificateSha256={process.env.NEXT_PUBLIC_GIMML_DEBUG_CERT_SHA256} /><EntitlementEditor merchantId={merchant.id} device={device} capabilities={data.capabilities} initialEntitlements={data.entitlements} token={token} canEdit={permissions.has('features.assign')} /></div>)}</div>{merchant.devices.filter(device => /^6459/.test(device.serial_number)).length === 0 && <div className="rounded border border-dashed p-4 text-sm text-gray-500">No combined Datecs terminals assigned.</div>}</div>)}</div></section>
    <CapabilityCatalog capabilities={data.capabilities} canEdit={permissions.has('catalog.pricing.manage')} token={token} />
    <TerminalReport transactions={data.transactions} />
  </main>;
}
