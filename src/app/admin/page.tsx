'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import Link from 'next/link';

export default function Admin() {
  const [merchants, setMerchants] = useState<any[]>([]);
  const [newName, setNewName] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    loadMerchants();
  }, []);

  async function loadMerchants() {
    const { data } = await supabase
      .from('merchants')
      .select('*');

    setMerchants(data || []);
  }

  async function addMerchant() {
    const cleaned = newName.trim();
    if (!cleaned) return;

    const slug = cleaned
      .toLowerCase()
      .replace(/\s+/g, '-') // ✅ better than replaceAll
      .replace(/[^a-z0-9-]/g, ''); // ✅ safe slug

    await supabase
      .from('merchants')
      .insert({
        name: cleaned,
        slug: slug
      });

    setNewName('');
    loadMerchants();
  }

  return (
    <div className="p-10 max-w-2xl mx-auto">
      
      <h1 className="text-3xl font-bold mb-8">Dashboard</h1>

      {/* SEARCH */}
      <input
        className="border rounded px-4 py-2 w-full mb-6"
        placeholder="Search merchants..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {/* ADD MERCHANT */}
      <div className="bg-white rounded-xl shadow p-6 mb-10 border">
        <h2 className="text-lg font-semibold mb-4">Add Merchant</h2>

        <div className="flex gap-3">
          <input
            className="border rounded px-4 py-2 flex-1"
            placeholder="Merchant name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />

          <button
            className="bg-black text-white px-5 py-2 rounded hover:opacity-80"
            onClick={addMerchant}
          >
            Add
          </button>
        </div>
      </div>

      {/* MERCHANT LIST */}
      <div>
        <h2 className="text-lg font-semibold mb-4">Merchants</h2>

        <div className="space-y-4">
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
