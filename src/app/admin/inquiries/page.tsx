'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../../lib/supabase';

type Inquiry = { id: string; created_at: string; inquiry_type: 'contact' | 'order_request'; status: string; full_name: string; email: string; phone: string | null; organization: string | null; plan: string | null; processor_preference: string | null; current_processor_name: string | null; quantity: number | null; message: string | null; shipping_address: string | null; shipping_city: string | null; shipping_state: string | null; shipping_postal_code: string | null; shipping_country: string | null; admin_notes: string | null; payment_status: string };

const processorLabels: Record<string, string> = {
  existing_account: 'Keep existing merchant account',
  fiserv_rapid_connect: 'Fiserv Rapid Connect',
  tsys_sierra: 'TSYS / Global Payments — Sierra',
  stripe_terminal: 'Stripe Terminal — compatible Stripe hardware required',
  help_me_choose: 'Help merchant choose'
};

export default function InquiriesPage() {
  const [inquiries, setInquiries] = useState<Inquiry[]>([]);
  const [filter, setFilter] = useState('open');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  const callApi = useCallback(async (method = 'GET', body?: object) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('Please sign in again.');
    const response = await fetch('/api/admin/inquiries', { method, headers: { Authorization: `Bearer ${session.access_token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'The request failed.');
    if (result.inquiries) setInquiries(result.inquiries);
  }, []);

  useEffect(() => { const timer = window.setTimeout(() => callApi().catch((reason) => setError(reason.message)).finally(() => setLoading(false)), 0); return () => window.clearTimeout(timer); }, [callApi]);
  const visible = useMemo(() => inquiries.filter((item) => filter === 'all' || (filter === 'open' ? item.status !== 'closed' : item.status === filter)), [filter, inquiries]);

  function edit(id: string, changes: Partial<Inquiry>) { setInquiries((current) => current.map((item) => item.id === id ? { ...item, ...changes } : item)); }
  async function save(item: Inquiry) { setBusy(item.id); setError(''); try { await callApi('PATCH', { id: item.id, status: item.status, adminNotes: item.admin_notes }); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Update failed.'); } finally { setBusy(''); } }

  return <main className="mx-auto max-w-6xl p-10"><h1 className="text-3xl font-black">Sales inquiries</h1><p className="mt-2 text-gray-600">Contact messages and device order requests submitted from the public website.</p>{error && <div className="mt-5 rounded border border-red-200 bg-red-50 p-3 text-red-700" role="alert">{error}</div>}<div className="mt-7 flex gap-3"><select value={filter} onChange={(event) => setFilter(event.target.value)} className="rounded border px-3 py-2"><option value="open">Open inquiries</option><option value="new">New</option><option value="contacted">Contacted</option><option value="qualified">Qualified</option><option value="closed">Closed</option><option value="all">All</option></select><span className="self-center text-sm text-gray-500">{visible.length} shown</span></div>{loading ? <div className="mt-8">Loading inquiries...</div> : <div className="mt-6 space-y-5">{visible.length === 0 && <div className="rounded-xl border border-dashed bg-white p-10 text-center text-gray-500">No inquiries match this filter.</div>}{visible.map((item) => <article key={item.id} className="rounded-xl border bg-white p-6 shadow-sm"><div className="flex flex-wrap justify-between gap-3"><div><div className="text-xs font-bold uppercase tracking-wide text-emerald-700">{item.inquiry_type === 'order_request' ? 'Device order request' : 'Contact message'}</div><h2 className="mt-1 text-xl font-bold">{item.full_name}{item.organization ? ` — ${item.organization}` : ''}</h2><div className="mt-1 text-sm text-gray-600"><a className="text-blue-700 underline" href={`mailto:${item.email}`}>{item.email}</a>{item.phone ? ` · ${item.phone}` : ''}</div></div><div className="text-right text-sm text-gray-500">{new Date(item.created_at).toLocaleString()}<div className="mt-1">Payment: {item.payment_status.replaceAll('_', ' ')}</div></div></div>{item.inquiry_type === 'order_request' && <div className="mt-4 rounded-lg bg-gray-50 p-4 text-sm"><strong>{item.quantity} device{item.quantity === 1 ? '' : 's'} · {item.plan}</strong><div className="mt-2"><span className="font-semibold">Processing preference:</span> {processorLabels[item.processor_preference || ''] || 'Not provided on this earlier request'}</div>{item.current_processor_name && <div className="mt-1"><span className="font-semibold">Current processor or platform:</span> {item.current_processor_name}</div>}{item.shipping_address && <div className="mt-2">Ship to: {item.shipping_address}, {item.shipping_city}, {item.shipping_state} {item.shipping_postal_code}, {item.shipping_country}</div>}</div>}{item.message && <div className="mt-4 whitespace-pre-wrap text-gray-700">{item.message}</div>}<div className="mt-5 grid gap-3 md:grid-cols-[180px_1fr_auto] md:items-end"><label className="text-sm">Status<select value={item.status} onChange={(event) => edit(item.id, { status: event.target.value })} className="mt-1 w-full rounded border px-3 py-2"><option value="new">New</option><option value="contacted">Contacted</option><option value="qualified">Qualified</option><option value="closed">Closed</option></select></label><label className="text-sm">Internal notes<input value={item.admin_notes || ''} onChange={(event) => edit(item.id, { admin_notes: event.target.value })} className="mt-1 w-full rounded border px-3 py-2" /></label><button disabled={busy === item.id} onClick={() => save(item)} className="rounded bg-blue-600 px-5 py-2 text-white disabled:opacity-50">{busy === item.id ? 'Saving...' : 'Save'}</button></div></article>)}</div>}</main>;
}
