'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

type Overview = {
  merchants: number;
  devices: number;
  activeDevices: number;
  transactions: number;
  approvedVolume: number;
};

const emptyOverview: Overview = {
  merchants: 0,
  devices: 0,
  activeDevices: 0,
  transactions: 0,
  approvedVolume: 0
};

function formatMoney(value: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
}

export default function DashboardOverview({ showMerchantCount = true }: { showMerchantCount?: boolean }) {
  const [overview, setOverview] = useState(emptyOverview);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(async () => {
      const [merchantResult, deviceResult, transactionResult] = await Promise.all([
        supabase.from('merchants').select('id'),
        supabase.from('devices').select('id, status'),
        supabase.from('transactions').select('status, amount')
      ]);

      if (!active) return;
      const requestError = merchantResult.error || deviceResult.error || transactionResult.error;
      if (requestError) {
        console.error('Dashboard overview failed:', requestError);
        setError('Summary information could not be loaded. The management pages are still available below.');
        setLoading(false);
        return;
      }

      const devices = deviceResult.data ?? [];
      const transactions = transactionResult.data ?? [];
      setOverview({
        merchants: merchantResult.data?.length ?? 0,
        devices: devices.length,
        activeDevices: devices.filter((device) => device.status === 'active').length,
        transactions: transactions.length,
        approvedVolume: transactions
          .filter((transaction) => transaction.status === 'approved')
          .reduce((sum, transaction) => sum + Number(transaction.amount || 0), 0)
      });
      setLoading(false);
    }, 0);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, []);

  if (loading) return <div className="mt-8 rounded-xl border bg-white p-6 text-gray-500 shadow-sm">Loading your overview...</div>;

  return (
    <section className="mt-8" aria-label="Account overview">
      {error && <div className="mb-4 rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{error}</div>}
      <div className={`grid gap-4 sm:grid-cols-2 ${showMerchantCount ? 'xl:grid-cols-4' : 'xl:grid-cols-3'}`}>
        {showMerchantCount && <div className="rounded-xl border bg-white p-5 shadow-sm"><div className="text-sm text-gray-500">Merchants</div><div className="mt-1 text-3xl font-bold">{overview.merchants}</div></div>}
        <div className="rounded-xl border bg-white p-5 shadow-sm"><div className="text-sm text-gray-500">Devices</div><div className="mt-1 text-3xl font-bold">{overview.devices}</div><div className="mt-1 text-xs text-gray-500">{overview.activeDevices} active</div></div>
        <div className="rounded-xl border bg-white p-5 shadow-sm"><div className="text-sm text-gray-500">Transactions</div><div className="mt-1 text-3xl font-bold">{overview.transactions}</div></div>
        <div className="rounded-xl border bg-white p-5 shadow-sm"><div className="text-sm text-gray-500">Approved volume</div><div className="mt-1 text-3xl font-bold text-green-700">{formatMoney(overview.approvedVolume)}</div></div>
      </div>
    </section>
  );
}
