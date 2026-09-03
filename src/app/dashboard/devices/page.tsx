'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { flattenMerchantDevices, UnifiedDeviceList, type ListedDevice } from '../../../components/devices/unified-device-list';
import { UnifiedDeviceSettings } from '../../../components/devices/unified-device-settings';
import type { TerminalDashboardData } from '../../../lib/gimml-terminal-dashboard/types';
import { supabase } from '../../../lib/supabase';

export default function DevicesPage() {
  const [data, setData] = useState<TerminalDashboardData | null>(null);
  const [token, setToken] = useState('');
  const [permissions, setPermissions] = useState<Set<string>>(new Set());
  const [role, setRole] = useState('');
  const [search, setSearch] = useState('');
  const [merchantId, setMerchantId] = useState('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [checkedAt, setCheckedAt] = useState(() => Date.now());

  const load = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) { setError('Please sign in again.'); setLoading(false); return; }
    setToken(session.access_token);
    const headers = { Authorization: 'Bearer ' + session.access_token };
    const [accessResponse, terminalResponse] = await Promise.all([
      fetch('/api/dashboard/access', { headers, cache: 'no-store' }),
      fetch('/api/dashboard/terminal', { headers, cache: 'no-store' })
    ]);
    const access = await accessResponse.json().catch(() => ({}));
    const terminal = await terminalResponse.json().catch(() => ({}));
    if (!accessResponse.ok || !terminalResponse.ok) {
      setError(access.error || terminal.error || 'Combined terminals could not be loaded.');
      setLoading(false);
      return;
    }
    setRole(access.role || '');
    setPermissions(new Set(access.permissions || []));
    setData(terminal);
    setCheckedAt(Date.now());
    setError('');
    setLoading(false);
  }, []);

  useEffect(() => {
    const initial = window.setTimeout(() => void load(), 0);
    const interval = window.setInterval(() => void load(), 30_000);
    return () => { window.clearTimeout(initial); window.clearInterval(interval); };
  }, [load]);

  const devices = useMemo(() => data ? flattenMerchantDevices(data.merchants) : [], [data]);
  const visibleDevices = useMemo(() => {
    const query = search.trim().toLowerCase();
    return devices.filter(device => {
      if (merchantId !== 'all' && device.merchantId !== merchantId) return false;
      if (!query) return true;
      const profile = device.device_profiles?.[0]?.profile_key ?? '';
      return [device.serial_number, device.merchantName, profile].some(value => value.toLowerCase().includes(query));
    });
  }, [devices, merchantId, search]);
  const selected: ListedDevice | undefined = devices.find(device => device.id === selectedId);

  if (loading) return <main className="p-10">Loading combined terminals…</main>;
  if (error) return <main className="mx-auto max-w-6xl p-10"><h1 className="text-3xl font-bold">Devices</h1><div className="mt-6 rounded border border-red-200 bg-red-50 p-4 text-red-800">{error}</div></main>;

  return <main className="mx-auto max-w-6xl space-y-6 p-6 sm:p-10">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h1 className="text-3xl font-bold">Devices</h1><p className="mt-1 text-gray-600">Only devices enrolled or prepared for the combined Gimml Terminal are shown here.</p></div>
      <Link href="/dashboard/terminal" className="rounded bg-blue-700 px-4 py-2 text-sm font-semibold text-white">Plans &amp; features</Link>
    </div>
    {!selected && <>
      <div className="grid gap-3 rounded-xl border bg-white p-4 md:grid-cols-2">
        <label className="text-sm font-medium">Search serial number, terminal type, or merchant
          <input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Enter any part of the value" className="mt-1 w-full rounded border px-3 py-2" />
        </label>
        {role !== 'merchant' && <label className="text-sm font-medium">Merchant
          <select value={merchantId} onChange={event => setMerchantId(event.target.value)} className="mt-1 w-full rounded border px-3 py-2">
            <option value="all">All authorized merchants</option>
            {data?.merchants.map(merchant => <option key={merchant.id} value={merchant.id}>{merchant.display_name}</option>)}
          </select>
        </label>}
      </div>
      <UnifiedDeviceList devices={visibleDevices} selectedId={selectedId} nowMs={checkedAt} onSelect={setSelectedId} />
    </>}
    {selected && <>
      <button type="button" onClick={() => setSelectedId(null)} className="text-sm font-semibold text-blue-700 hover:underline">← Back to all devices</button>
      <UnifiedDeviceSettings key={selected.id + ':' + selected.config_revision} device={selected} token={token} canConfigure={permissions.has('devices.configure')} onSaved={load} />
      {(role === 'admin' || role === 'super_admin') && <Link href={'/dashboard/devices/' + selected.id + '/setup'} className="inline-block rounded border px-4 py-2 text-sm font-semibold">Processor and deployment setup</Link>}
    </>}
  </main>;
}
