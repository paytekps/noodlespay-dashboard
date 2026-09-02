'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabase';

type Merchant = { id: string; name: string; slug: string };

export default function MerchantsPage() {
  const [merchants, setMerchants] = useState<Merchant[]>([]);
  const [search, setSearch] = useState('');
  const [newName, setNewName] = useState('');
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState('');
  const load = useCallback(async () => { const result = await supabase.from('merchants').select('id, name, slug').order('name'); if (result.error) setError('Merchants could not be loaded.'); else setMerchants(result.data ?? []); }, []);
  useEffect(() => { const timer = window.setTimeout(() => { void load(); }, 0); return () => window.clearTimeout(timer); }, [load]);
  async function addMerchant() { const name = newName.trim(); if (!name) return; setAdding(true); setError(''); const slug = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''); const result = await supabase.from('merchants').insert({ name, slug }); if (result.error) setError(result.error.code === '23505' ? 'A merchant with that name already exists.' : 'The merchant could not be added.'); else { setNewName(''); await load(); } setAdding(false); }
  const visible = merchants.filter(merchant => merchant.name.toLowerCase().includes(search.toLowerCase()));
  return <main className="mx-auto max-w-4xl p-10"><h1 className="text-3xl font-bold">Merchants</h1><p className="mt-2 text-gray-600">Add merchants and open their account records. Merchant management is separate from Overview.</p>{error && <div className="mt-5 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}<form className="mt-8 rounded-xl border bg-white p-5 shadow-sm" onSubmit={event => { event.preventDefault(); void addMerchant(); }}><h2 className="font-semibold">Add merchant</h2><div className="mt-3 flex gap-3"><input aria-label="Merchant name" value={newName} onChange={event => setNewName(event.target.value)} placeholder="Merchant name" className="min-w-0 flex-1 rounded border px-3 py-2" /><button disabled={adding || !newName.trim()} className="rounded bg-gray-950 px-4 py-2 font-semibold text-white disabled:opacity-50">{adding ? 'Adding…' : 'Add merchant'}</button></div></form><label className="mt-8 block text-sm font-medium">Search merchants<input value={search} onChange={event => setSearch(event.target.value)} className="mt-1 w-full rounded border px-3 py-2" /></label><div className="mt-5 grid gap-3">{visible.map(merchant => <Link key={merchant.id} href={`/admin/merchant/${merchant.slug}`} className="rounded-xl border bg-white p-5 shadow-sm transition hover:border-blue-300"><div className="font-semibold">{merchant.name}</div><div className="mt-1 text-xs text-gray-500">Open merchant account</div></Link>)}{visible.length === 0 && <div className="rounded-xl border border-dashed p-8 text-center text-gray-500">No merchants match this search.</div>}</div></main>;
}
