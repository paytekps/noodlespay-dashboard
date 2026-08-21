'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../../lib/supabase';

type BatchDevice = {
  id: string;
  name: string;
  serial_number: string | null;
  merchant_name: string;
  capture_mode: 'host' | 'terminal' | 'not_configured';
  settlement_status: 'active' | 'setup_required';
  auto_settlement_enabled: boolean;
  settlement_time: string | null;
  time_zone: string | null;
};

type SettlementRun = {
  id: string;
  device_id: string;
  business_date: string;
  scheduled_for: string | null;
  request_source: 'scheduled' | 'manual';
  status: 'queued' | 'processing' | 'succeeded' | 'failed' | 'cancelled' | 'expired';
  requested_at: string;
  completed_at: string | null;
  attempt_count: number;
  transaction_count: number | null;
  total_amount: number | string | null;
  batch_id: string | null;
  device_message: string | null;
};

function money(value: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
}

function statusClass(status: SettlementRun['status']) {
  if (status === 'succeeded') return 'bg-green-100 text-green-800';
  if (status === 'failed' || status === 'expired') return 'bg-red-100 text-red-800';
  if (status === 'processing') return 'bg-blue-100 text-blue-800';
  if (status === 'cancelled') return 'bg-gray-200 text-gray-700';
  return 'bg-amber-100 text-amber-900';
}

function csvCell(value: unknown) {
  const text = value === null || value === undefined ? '' : String(value);
  const spreadsheetSafeText = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return `"${spreadsheetSafeText.replaceAll('"', '""')}"`;
}

export default function BatchReportsPage() {
  const [role, setRole] = useState('merchant');
  const [devices, setDevices] = useState<BatchDevice[]>([]);
  const [settlements, setSettlements] = useState<SettlementRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [deviceFilter, setDeviceFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [settlingDeviceId, setSettlingDeviceId] = useState<string | null>(null);

  const authenticatedFetch = useCallback(async (url: string, options: RequestInit = {}) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error('Please sign in again.');
    return fetch(url, {
      ...options,
      headers: { ...options.headers, Authorization: `Bearer ${session.access_token}` },
      cache: 'no-store'
    });
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await authenticatedFetch('/api/dashboard/settlements');
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Batch reports could not be loaded.');
      setRole(payload.role || 'merchant');
      setDevices(payload.devices || []);
      setSettlements(payload.settlements || []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Batch reports could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [authenticatedFetch]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const deviceById = useMemo(
    () => new Map(devices.map((device) => [device.id, device])),
    [devices]
  );

  const filteredSettlements = useMemo(() => settlements.filter((run) => {
    if (deviceFilter !== 'all' && run.device_id !== deviceFilter) return false;
    if (statusFilter !== 'all' && run.status !== statusFilter) return false;
    if (dateFrom && run.business_date < dateFrom) return false;
    if (dateTo && run.business_date > dateTo) return false;
    return true;
  }), [dateFrom, dateTo, deviceFilter, settlements, statusFilter]);

  const completed = filteredSettlements.filter((run) => run.status === 'succeeded');
  const completedAmount = completed.reduce((sum, run) => sum + Number(run.total_amount || 0), 0);
  const completedTransactions = completed.reduce((sum, run) => sum + Number(run.transaction_count || 0), 0);
  const attentionCount = filteredSettlements.filter((run) => ['failed', 'expired'].includes(run.status)).length;
  const canAdminister = role === 'super_admin' || role === 'admin';

  async function runEndOfDay(device: BatchDevice) {
    if (!window.confirm(`Run End of Day now for ${device.name}? This closes the current terminal batch.`)) return;
    setSettlingDeviceId(device.id);
    setError('');
    setNotice('');
    try {
      const response = await authenticatedFetch('/api/admin/devices/settlements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId: device.id, confirm: true })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'End of Day could not be queued.');
      setNotice(`End of Day was queued for ${device.name}. The report will update after the device responds.`);
      await load();
    } catch (settlementError) {
      setError(settlementError instanceof Error ? settlementError.message : 'End of Day could not be queued.');
    } finally {
      setSettlingDeviceId(null);
    }
  }

  function exportCsv() {
    const headers = ['Business Date', 'Requested', 'Completed', 'Merchant', 'Device', 'Serial', 'Source', 'Status', 'Transactions', 'Total', 'Batch ID', 'Attempts', 'Device Message'];
    const rows = filteredSettlements.map((run) => {
      const device = deviceById.get(run.device_id);
      return [
        run.business_date,
        run.requested_at,
        run.completed_at,
        device?.merchant_name,
        device?.name,
        device?.serial_number,
        run.request_source,
        run.status,
        run.transaction_count,
        run.total_amount,
        run.batch_id,
        run.attempt_count,
        run.device_message
      ];
    });
    const csv = [headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `gimml-batches-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="mx-auto max-w-7xl space-y-6 p-6 sm:p-10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Batch reports</h1>
          <p className="mt-1 text-gray-600">Settlement totals, batch IDs, status, and device responses for the merchants you are allowed to view.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/transactions" className="rounded-lg border bg-white px-4 py-2 text-sm font-semibold">Transactions</Link>
          <Link href="/dashboard/devices" className="rounded-lg border bg-white px-4 py-2 text-sm font-semibold">Devices</Link>
          <button type="button" onClick={exportCsv} disabled={!filteredSettlements.length} className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Export CSV</button>
        </div>
      </div>

      <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-950">
        Host-capture processors close their batches at the processor. Terminal-capture devices use the automatic schedule configured by an administrator. Processor setup numbers are never shown on this page.
      </div>
      {error && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-800" role="alert">{error}</div>}
      {notice && <div className="rounded-xl border border-green-200 bg-green-50 p-4 text-green-800" role="status">{notice}</div>}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Batch summary">
        <div className="rounded-xl border bg-white p-4"><div className="text-sm text-gray-500">Successful batches</div><div className="mt-1 text-2xl font-bold">{completed.length}</div></div>
        <div className="rounded-xl border bg-white p-4"><div className="text-sm text-gray-500">Settled transactions</div><div className="mt-1 text-2xl font-bold">{completedTransactions.toLocaleString()}</div></div>
        <div className="rounded-xl border bg-white p-4"><div className="text-sm text-gray-500">Settled total</div><div className="mt-1 text-2xl font-bold text-green-700">{money(completedAmount)}</div></div>
        <div className="rounded-xl border bg-white p-4"><div className="text-sm text-gray-500">Needs attention</div><div className={`mt-1 text-2xl font-bold ${attentionCount ? 'text-red-700' : ''}`}>{attentionCount}</div></div>
      </section>

      <section className="rounded-xl border bg-white p-5">
        <h2 className="text-lg font-semibold">Device settlement status</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {devices.map((device) => (
            <div key={device.id} className="rounded-lg border p-4">
              <div className="flex items-start justify-between gap-3">
                <div><div className="font-semibold">{device.name}</div>{role !== 'merchant' && <div className="text-sm text-gray-500">{device.merchant_name}</div>}<div className="text-xs text-gray-500">Serial {device.serial_number || 'not recorded'}</div></div>
                <span className="rounded-full bg-gray-100 px-2 py-1 text-xs font-semibold capitalize">{device.capture_mode.replaceAll('_', ' ')}</span>
              </div>
              <div className="mt-3 text-sm text-gray-700">
                {device.capture_mode === 'host'
                  ? 'The processor manages settlement.'
                  : device.auto_settlement_enabled
                    ? `Automatic close at ${String(device.settlement_time || '').slice(0, 5)} (${device.time_zone || 'local time'}).`
                    : 'Automatic settlement is not enabled.'}
              </div>
              {device.settlement_status !== 'active' && <div className="mt-2 text-sm text-amber-800">An administrator still needs to finish settlement setup.</div>}
              {canAdminister && device.capture_mode === 'terminal' && (
                <button type="button" onClick={() => runEndOfDay(device)} disabled={settlingDeviceId === device.id || device.settlement_status !== 'active'} className="mt-3 rounded-lg bg-red-700 px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40">
                  {settlingDeviceId === device.id ? 'Queuing…' : 'Run End of Day now'}
                </button>
              )}
            </div>
          ))}
          {!loading && devices.length === 0 && <div className="text-sm text-gray-500">No devices are available.</div>}
        </div>
      </section>

      <section className="rounded-xl border bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-semibold">Settlement history</h2><button type="button" onClick={() => void load()} disabled={loading} className="rounded-lg border px-3 py-2 text-sm font-semibold disabled:opacity-50">{loading ? 'Loading…' : 'Refresh'}</button></div>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <label className="text-sm">Device<select value={deviceFilter} onChange={(event) => setDeviceFilter(event.target.value)} className="mt-1 w-full rounded-lg border px-3 py-2"><option value="all">All devices</option>{devices.map((device) => <option key={device.id} value={device.id}>{device.name}</option>)}</select></label>
          <label className="text-sm">Status<select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="mt-1 w-full rounded-lg border px-3 py-2"><option value="all">All statuses</option><option value="succeeded">Succeeded</option><option value="queued">Queued</option><option value="processing">Processing</option><option value="failed">Failed</option><option value="expired">Expired</option><option value="cancelled">Cancelled</option></select></label>
          <label className="text-sm">From<input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} className="mt-1 w-full rounded-lg border px-3 py-2" /></label>
          <label className="text-sm">Through<input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} className="mt-1 w-full rounded-lg border px-3 py-2" /></label>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead><tr className="border-b bg-gray-50 text-gray-600"><th className="p-3">Requested</th><th className="p-3">Business date</th><th className="p-3">Device</th>{role !== 'merchant' && <th className="p-3">Merchant</th>}<th className="p-3">Source</th><th className="p-3">Status</th><th className="p-3">Transactions</th><th className="p-3">Total</th><th className="p-3">Batch ID</th><th className="p-3">Message</th></tr></thead>
            <tbody>
              {loading ? <tr><td colSpan={role === 'merchant' ? 9 : 10} className="p-8 text-center text-gray-500">Loading batch reports…</td></tr> : filteredSettlements.length === 0 ? <tr><td colSpan={role === 'merchant' ? 9 : 10} className="p-8 text-center text-gray-500">No settlement records match these filters.</td></tr> : filteredSettlements.map((run) => {
                const device = deviceById.get(run.device_id);
                return <tr key={run.id} className="border-b align-top"><td className="p-3">{new Date(run.requested_at).toLocaleString()}</td><td className="p-3">{run.business_date}</td><td className="p-3">{device?.name || 'Unknown device'}</td>{role !== 'merchant' && <td className="p-3">{device?.merchant_name || '—'}</td>}<td className="p-3 capitalize">{run.request_source}</td><td className="p-3"><span className={`rounded-full px-2 py-1 text-xs font-semibold ${statusClass(run.status)}`}>{run.status}</span></td><td className="p-3">{run.transaction_count ?? '—'}</td><td className="p-3">{run.total_amount == null ? '—' : money(Number(run.total_amount))}</td><td className="p-3">{run.batch_id || '—'}</td><td className="max-w-xs p-3">{run.device_message || '—'}</td></tr>;
              })}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
