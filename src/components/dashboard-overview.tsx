'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

type Overview = { devices: number; connectedDevices: number; transactions: number; approved: number; declined: number; approvedVolumeMinor: number };
type Range = 'all' | 'today' | '7days' | '30days' | 'custom';
const emptyOverview: Overview = { devices: 0, connectedDevices: 0, transactions: 0, approved: 0, declined: 0, approvedVolumeMinor: 0 };

function dateInput(date: Date) { return date.toISOString().slice(0, 10); }
function formatMoney(minor: number) { return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(minor / 100); }

export default function DashboardOverview() {
  const [overview, setOverview] = useState(emptyOverview);
  const [range, setRange] = useState<Range>('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async (selectedRange: Range, customFrom = '', customTo = '') => {
    setLoading(true); setError('');
    const now = new Date();
    let start = ''; let end = '';
    if (selectedRange === 'today') start = end = dateInput(now);
    if (selectedRange === '7days') { const date = new Date(now); date.setUTCDate(date.getUTCDate() - 6); start = dateInput(date); end = dateInput(now); }
    if (selectedRange === '30days') { const date = new Date(now); date.setUTCDate(date.getUTCDate() - 29); start = dateInput(date); end = dateInput(now); }
    if (selectedRange === 'custom') { start = customFrom; end = customTo; }
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) { setError('Please sign in again.'); setLoading(false); return; }
    const query = new URLSearchParams();
    if (start) query.set('from', start);
    if (end) query.set('to', end);
    const response = await fetch(`/api/dashboard/overview${query.size ? `?${query}` : ''}`, { headers: { Authorization: `Bearer ${session.access_token}` }, cache: 'no-store' });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) setError(payload.error ?? 'Overview information could not be loaded.'); else setOverview(payload);
    setLoading(false);
  }, []);

  useEffect(() => { const timer = window.setTimeout(() => { void load('all'); }, 0); return () => window.clearTimeout(timer); }, [load]);
  function chooseRange(value: Range) { setRange(value); if (value !== 'custom') void load(value); }

  return <section className="mt-8" aria-label="Account overview">
    <div className="rounded-xl border bg-white p-5 shadow-sm"><div className="flex flex-wrap items-end gap-4"><label className="text-sm font-medium">Date range<select value={range} onChange={event => chooseRange(event.target.value as Range)} className="mt-1 block rounded border bg-white px-3 py-2"><option value="all">All time</option><option value="today">Today</option><option value="7days">Last 7 days</option><option value="30days">Last 30 days</option><option value="custom">Custom range</option></select></label>{range === 'custom' && <><label className="text-sm font-medium">From<input type="date" value={from} onChange={event => setFrom(event.target.value)} className="mt-1 block rounded border px-3 py-2" /></label><label className="text-sm font-medium">To<input type="date" value={to} onChange={event => setTo(event.target.value)} className="mt-1 block rounded border px-3 py-2" /></label><button type="button" disabled={!from || !to || loading} onClick={() => void load('custom', from, to)} className="rounded bg-gray-950 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Apply</button></>}</div><p className="mt-2 text-xs text-gray-500">Transaction totals use the selected range. Device connection status is current.</p></div>
    {error && <div className="mt-4 rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{error}</div>}
    {loading ? <div className="mt-4 rounded-xl border bg-white p-6 text-gray-500 shadow-sm">Loading overview…</div> : <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3"><div className="rounded-xl border bg-white p-5 shadow-sm"><div className="text-sm text-gray-500">Combined Datecs devices</div><div className="mt-1 text-3xl font-bold">{overview.devices}</div><div className="mt-1 text-xs text-gray-500">{overview.connectedDevices} connected now</div></div><div className="rounded-xl border bg-white p-5 shadow-sm"><div className="text-sm text-gray-500">Transactions</div><div className="mt-1 text-3xl font-bold">{overview.transactions}</div><div className="mt-1 text-xs text-gray-500">{overview.approved} approved · {overview.declined} declined</div></div><div className="rounded-xl border bg-white p-5 shadow-sm"><div className="text-sm text-gray-500">Approved volume</div><div className="mt-1 text-3xl font-bold text-green-700">{formatMoney(overview.approvedVolumeMinor)}</div></div></div>}
  </section>;
}
