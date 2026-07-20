'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';

export default function TransactionsPage() {
  const [transactions, setTransactions] = useState<any[]>([]);
const [selectedTransaction, setSelectedTransaction] = useState<any>(null);
  useEffect(() => {
    loadTransactions();
  }, []);

  async function loadTransactions() {
    const { data, error } = await supabase
      .from('transactions')
      
.select(`
  id,
  created_at,
  amount,
  status,
  payment_method,

  transaction_id,
  authorization_code,
  reference_number,

  batch_id,
  trace_no,

  card_issuer,
  card_bin,
  last4,

  account_type,
  card_entry_method,

  payment_program,

  host_message,

  base_amount,
  tip_amount,
  fee_amount,
  cashback_amount,
  processed_amount,

  devices (
    name
  ),
  merchants (
    name
  )
`)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error loading transactions:', error);
      return;
    }

    setTransactions(data || []);
  }

  return (
    <div className="p-10">
      <h1 className="text-2xl font-bold mb-6">Transactions</h1>

      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-gray-100">
            <tr>
              <th className="p-3">Time</th>
<th className="p-3">Merchant</th>
              <th className="p-3">Device</th>
              <th className="p-3">Amount</th>
              <th className="p-3">Status</th>
              <th className="p-3">Method</th>
              <th className="p-3">Details</th>
            </tr>
          </thead>

          <tbody>
            {transactions.map((t) => (
              <tr key={t.id} className="border-t">
                <td className="p-3 text-sm">
                  {new Date(t.created_at).toLocaleString()}
                </td>

                
<td className="p-3">
  {t.merchants?.name || '—'}
</td>

<td className="p-3">
  {t.devices?.name || t.device_id}
</td>


                <td className="p-3 font-semibold">
                  ${t.amount}
                </td>

                <td className="p-3">
                  <span
                    className={`px-2 py-1 rounded text-sm ${
                      t.status === 'approved'
                        ? 'bg-green-100 text-green-700'
                        : 'bg-red-100 text-red-700'
                    }`}
                  >
                    {t.status}
                  </span>
                </td>

                <td className="p-3 text-sm text-gray-600">
                  {t.payment_method}
                </td>
                <td className="p-3">
  <button
onClick={() => setSelectedTransaction(t)}
    className="text-blue-600 underline"
  >
    View
  </button>
</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
``
