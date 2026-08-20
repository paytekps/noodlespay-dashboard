'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import Link from 'next/link';
import DashboardOverview from '../../components/dashboard-overview';

export default function Admin() {
  const [merchants, setMerchants] = useState<any[]>([]);
  const [newName, setNewName] = useState('');
  const [search, setSearch] = useState('');
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    loadMerchants();
  }, []);

  async function loadMerchants() {
    const { data, error: loadError } = await supabase
      .from('merchants')
      .select('*')
      .order('name');

    if (loadError) {
      console.error('Merchant list failed:', loadError);
      setError('Merchants could not be loaded. Please refresh and try again.');
      return;
    }
    setMerchants(data || []);
  }

  async function addMerchant() {
    const cleaned = newName.trim();
    if (!cleaned) return;
    setAdding(true);
    setError('');

    const slug = cleaned
      .toLowerCase()
      .replace(/\s+/g, '-') // ✅ better than replaceAll
      .replace(/[^a-z0-9-]/g, ''); // ✅ safe slug

    const { error: addError } = await supabase
      .from('merchants')
      .insert({
        name: cleaned,
        slug: slug
      });

    if (addError) {
      console.error('Merchant creation failed:', addError);
      setError(addError.code === '23505' ? 'A merchant with that name or web address already exists.' : 'The merchant could not be added.');
      setAdding(false);
      return;
    }

    setNewName('');
    await loadMerchants();
    setAdding(false);
  }

  return (
    <div className="p-10 max-w-2xl mx-auto">
      
      <h1 className="text-3xl font-bold">Administration dashboard</h1>
      <p className="mt-2 text-gray-600">Manage merchants, devices, users, and payment activity.</p>
      <DashboardOverview />

      {error && <div className="mt-6 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700" role="alert">{error}</div>}

      {/* SEARCH */}
      <input
        className="mt-8 border rounded px-4 py-2 w-full mb-6"
        placeholder="Search merchants..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {/* ADD MERCHANT */}
      <form className="bg-white rounded-xl shadow p-6 mb-10 border" onSubmit={(event) => { event.preventDefault(); void addMerchant(); }}>
        <h2 className="text-lg font-semibold mb-4">Add Merchant</h2>

        <div className="flex gap-3">
          <input
            className="border rounded px-4 py-2 flex-1"
            placeholder="Merchant name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />

          <button
            type="submit"
            disabled={adding}
            className="bg-black text-white px-5 py-2 rounded hover:opacity-80"
          >
            {adding ? 'Adding...' : 'Add'}
          </button>
        </div>
      </form>

      {/* MERCHANT LIST */}
      <div>
        <h2 className="text-lg font-semibold mb-4">Merchants</h2>

        <div className="space-y-4">
          {merchants.length === 0 && <div className="rounded-xl border border-dashed bg-white p-8 text-center text-gray-500">No merchants have been added yet.</div>}
          {merchants
            .filter((m) =>
              m.name.toLowerCase().includes(search.toLowerCase())
            )
            .map((m) => (
              <Link key={m.id} href={`/admin/merchant/${m.slug}`}>
                <div className="bg-white p-5 rounded-xl border hover:shadow transition cursor-pointer">
                  <div className="font-semibold text-lg">{m.name}</div>

                  <div className="text-sm text-gray-500 mt-1">
                    /{m.slug}
                  </div>
                </div>
              </Link>
            ))}
        </div>
      </div>

    </div>
  );
}
