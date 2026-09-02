'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import ClosedLoopProgramSummary from '../../../../components/closed-loop-program-summary';
import MerchantCombinedDevices from '../../../../components/merchant-combined-devices';
import { supabase } from '../../../../lib/supabase';

type MerchantDetail = {
  merchant: { id: string; name: string; status: string; billing_status: string; primary_contact_name: string | null; primary_contact_email: string | null };
  devices: Array<{ id: string; name: string; serial_number: string; status: string; enrollment_state: string; config_revision: number; profile_key: string | null; layout_key: string | null }>;
  closedLoopPrograms: Array<{ id: string; display_name: string; bin_prefix: string; enabled: boolean }>;
};

export default function MerchantPage() {
  const slug = useParams<{ slug: string }>()?.slug;
  const [data, setData] = useState<MerchantDetail | null>(null);
  const [error, setError] = useState('');

  const loadData = useCallback(async () => {
    if (!slug) return;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error('Please sign in again.');
    const response = await fetch(`/api/admin/merchants/${encodeURIComponent(slug)}`, { headers: { Authorization: `Bearer ${session.access_token}` }, cache: 'no-store' });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || 'Merchant details could not be loaded.');
    setData(payload);
  }, [slug]);

  useEffect(() => { const timer = window.setTimeout(() => { void loadData().catch(cause => setError(cause instanceof Error ? cause.message : 'Merchant details could not be loaded.')); }, 0); return () => window.clearTimeout(timer); }, [loadData]);

  if (error) return <main className="mx-auto max-w-5xl p-10"><Link href="/admin/merchants" className="text-sm text-blue-700">← Back to Merchants</Link><div className="mt-6 rounded border border-red-200 bg-red-50 p-4 text-red-700" role="alert">{error}</div></main>;
  if (!data) return <main className="mx-auto max-w-5xl p-10">Loading merchant…</main>;

  return <main className="mx-auto max-w-5xl p-10">
    <Link href="/admin/merchants" className="text-sm text-blue-700">← Back to Merchants</Link>
    <div className="mt-4 flex flex-wrap items-start justify-between gap-4"><div><h1 className="text-3xl font-bold">{data.merchant.name}</h1><p className="mt-1 text-gray-600">Merchant details and combined Gimml Terminal devices</p></div><div className="flex gap-2"><span className="rounded-full bg-gray-100 px-3 py-1 text-sm capitalize">{data.merchant.status}</span><span className="rounded-full bg-gray-100 px-3 py-1 text-sm">Billing: {data.merchant.billing_status.replaceAll('_', ' ')}</span></div></div>
    <section className="mt-7 rounded-xl border bg-white p-5 shadow-sm"><h2 className="text-lg font-semibold">Merchant contact</h2><p className="mt-2 text-sm text-gray-700">{data.merchant.primary_contact_name || 'No primary contact'}{data.merchant.primary_contact_email ? ` · ${data.merchant.primary_contact_email}` : ''}</p></section>
    <MerchantCombinedDevices devices={data.devices} />
    <ClosedLoopProgramSummary programs={data.closedLoopPrograms} />
  </main>;
}
