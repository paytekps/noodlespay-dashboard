'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';

function formatMoney(value: number | null | undefined) {
  if (value === null || value === undefined) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD'
  }).format(Number(value));
}

function csvCell(value: unknown) {
  let text = value === null || value === undefined ? '' : String(value);
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

export default function TransactionsPage() {
const [transactions, setTransactions] = useState<any[]>([]);
const [selectedTransaction, setSelectedTransaction] = useState<any>(null);
const [profileRole, setProfileRole] = useState('');

const [search, setSearch] = useState('');
const [merchantFilter, setMerchantFilter] = useState('all');
const [statusFilter, setStatusFilter] = useState('all');
const [brandFilter, setBrandFilter] = useState('all');
const [dateFrom, setDateFrom] = useState('');
const [dateTo, setDateTo] = useState('');
const [loading, setLoading] = useState(true);
const [loadError, setLoadError] = useState('');

useEffect(() => {
  let active = true;

  supabase.auth.getUser().then(async ({ data: { user } }) => {
    if (!user || !active) return;
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle();
    if (active) setProfileRole(profile?.role || '');
  });

  const request = supabase
      .from('transactions')
      
.select(`
  id,
  created_at,
  device_id,
  merchant_id,
  amount,
  status,
  payment_method,
  authorization_source,

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

  request.then(({ data, error }) => {
    if (!active) return;

    if (error) {
      console.error('Error loading transactions:', error);
      setLoadError('Transactions could not be loaded. Please refresh and try again.');
      setLoading(false);
      return;
    }

setTransactions(data || []);
setLoading(false);
  });

  return () => {
    active = false;
  };
}, []);

const filteredTransactions = transactions.filter((t) => {
  const q = search.toLowerCase();

  const matchesSearch =
    (t.transaction_id || '').toLowerCase().includes(q) ||
    (t.authorization_code || '').toLowerCase().includes(q) ||
    (t.reference_number || '').toLowerCase().includes(q) ||
    (t.card_bin || '').toLowerCase().includes(q) ||
    (t.last4 || '').toLowerCase().includes(q) ||
    (t.card_issuer || '').toLowerCase().includes(q) ||
    (t.payment_program || '').toLowerCase().includes(q) ||
    (t.devices?.name || '').toLowerCase().includes(q) ||
    (t.merchants?.name || '').toLowerCase().includes(q);

  const matchesStatus =
    statusFilter === 'all' ||
    t.status === statusFilter;

  const matchesBrand =
    brandFilter === 'all' ||
    t.card_issuer === brandFilter;

  const matchesMerchant =
    merchantFilter === 'all' ||
    t.merchant_id === merchantFilter;

  const transactionTime = new Date(t.created_at).getTime();
  const matchesDateFrom =
    !dateFrom || transactionTime >= new Date(`${dateFrom}T00:00:00`).getTime();
  const matchesDateTo =
    !dateTo || transactionTime <= new Date(`${dateTo}T23:59:59.999`).getTime();

  return matchesSearch && matchesStatus && matchesBrand && matchesMerchant && matchesDateFrom && matchesDateTo;
});

const cardBrands = useMemo(() =>
  Array.from(new Set(transactions.map(t => t.card_issuer).filter(Boolean))).sort(),
  [transactions]
);

const merchantOptions = useMemo(() => {
  const options = new Map<string, string>();
  transactions.forEach((transaction) => {
    if (transaction.merchant_id) {
      options.set(transaction.merchant_id, transaction.merchants?.name || 'Unnamed merchant');
    }
  });
  return Array.from(options, ([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
}, [transactions]);

const accessDescription = profileRole === 'merchant'
  ? 'Showing transactions for your merchant account only.'
  : profileRole === 'sales_rep'
    ? 'Showing transactions for merchants assigned to you.'
    : 'Showing transactions across all merchants.';

const approvedTransactions = filteredTransactions.filter(t => t.status === 'approved');
const approvedVolume = approvedTransactions.reduce((sum, t) => sum + Number(t.amount || 0), 0);
const declinedCount = filteredTransactions.filter(t => t.status === 'declined').length;
const averageApproved = approvedTransactions.length ? approvedVolume / approvedTransactions.length : 0;

function exportCsv() {
  const headers = [
    'Date', 'Merchant', 'Device', 'Status', 'Amount', 'Base Amount', 'Tip', 'Fee',
    'Cashback', 'Processed Amount', 'Payment Method', 'Card Brand', 'BIN', 'Last 4',
    'Entry Method', 'Account Type', 'Payment Program', 'Transaction ID',
    'Authorization Code', 'Reference Number', 'Batch ID', 'Trace Number', 'Host Message'
  ];

  const rows = filteredTransactions.map(t => [
    new Date(t.created_at).toISOString(), t.merchants?.name, t.devices?.name,
    t.status, t.amount, t.base_amount, t.tip_amount, t.fee_amount,
    t.cashback_amount, t.processed_amount, t.payment_method, t.card_issuer,
    t.card_bin, t.last4, t.card_entry_method, t.account_type, t.payment_program,
    t.transaction_id, t.authorization_code, t.reference_number, t.batch_id,
    t.trace_no, t.host_message
  ]);

  const csv = [headers, ...rows].map(row => row.map(csvCell).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `noodlpay-transactions-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

  return (
    <div className="p-10">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div><h1 className="text-2xl font-bold">Transactions</h1><p className="mt-1 text-sm text-gray-600">{accessDescription}</p></div>
        <button
          type="button"
          onClick={exportCsv}
          disabled={!filteredTransactions.length}
          className="rounded bg-blue-600 px-4 py-2 text-white disabled:opacity-50"
        >
          Export CSV
        </button>
      </div>

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border bg-white p-4">
          <div className="text-sm text-gray-500">Approved volume</div>
          <div className="text-2xl font-bold text-green-700">{formatMoney(approvedVolume)}</div>
        </div>
        <div className="rounded-lg border bg-white p-4">
          <div className="text-sm text-gray-500">Approved transactions</div>
          <div className="text-2xl font-bold">{approvedTransactions.length}</div>
        </div>
        <div className="rounded-lg border bg-white p-4">
          <div className="text-sm text-gray-500">Declined transactions</div>
          <div className="text-2xl font-bold text-red-700">{declinedCount}</div>
        </div>
        <div className="rounded-lg border bg-white p-4">
          <div className="text-sm text-gray-500">Average approved amount</div>
          <div className="text-2xl font-bold">{formatMoney(averageApproved)}</div>
        </div>
      </div>

      <div className="mb-3 grid gap-3 md:grid-cols-2 xl:grid-cols-6">
  <input
    type="search"
    placeholder="Search ID, card, merchant, or device"
    value={search}
    onChange={(e) => setSearch(e.target.value)}
    className="border px-3 py-2 rounded xl:col-span-2"
  />

  <select
    value={statusFilter}
    onChange={(e) => setStatusFilter(e.target.value)}
    className="border px-3 py-2 rounded"
  >
    <option value="all">All Statuses</option>
    <option value="approved">Approved</option>
    <option value="declined">Declined</option>
    <option value="pending">Pending</option>
  </select>

  <select
    value={brandFilter}
    onChange={(e) => setBrandFilter(e.target.value)}
    className="border px-3 py-2 rounded"
  >
    <option value="all">All Cards</option>
    {cardBrands.map(brand => <option key={brand} value={brand}>{brand}</option>)}
  </select>

  {profileRole !== 'merchant' && (
    <select value={merchantFilter} onChange={(e) => setMerchantFilter(e.target.value)} className="rounded border px-3 py-2">
      <option value="all">All Merchants</option>
      {merchantOptions.map((merchant) => <option key={merchant.id} value={merchant.id}>{merchant.name}</option>)}
    </select>
  )}

  <button
    type="button"
    onClick={() => {
      setSearch('');
      setMerchantFilter('all');
      setStatusFilter('all');
      setBrandFilter('all');
      setDateFrom('');
      setDateTo('');
    }}
    className="rounded border px-3 py-2"
  >
    Clear filters
  </button>
</div>

<div className="mb-6 grid gap-3 sm:grid-cols-2">
  <label className="text-sm text-gray-600">
    From
    <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="mt-1 w-full rounded border px-3 py-2 text-black" />
  </label>
  <label className="text-sm text-gray-600">
    Through
    <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="mt-1 w-full rounded border px-3 py-2 text-black" />
  </label>
</div>

{loadError && (
  <div className="mb-6 rounded border border-red-200 bg-red-50 p-4 text-red-700" role="alert">
    {loadError}
  </div>
)}
{selectedTransaction && (
  <div className="mb-6 p-4 border rounded-lg bg-white">
    <h2 className="text-lg font-bold mb-3">
      Transaction Details
    </h2>
<button
  onClick={() => setSelectedTransaction(null)}
  className="mb-4 px-3 py-1 bg-gray-200 rounded"
>
  Close
</button>
<h3 className="font-semibold mb-2">Transaction</h3>

<div>Transaction ID: {selectedTransaction.transaction_id}</div>
<div>Status: {selectedTransaction.status}</div>
<div>Amount: {formatMoney(selectedTransaction.amount)}</div>
<div>
  Date:
  {new Date(selectedTransaction.created_at).toLocaleString()}
</div>
<h3 className="font-semibold mt-4 mb-2">Card</h3>
    <div className="mt-3">
      Card: {selectedTransaction.card_issuer}
    </div>
    <div>BIN: {selectedTransaction.card_bin}</div>
    <div>Last 4: {selectedTransaction.last4}</div>
    <div>Account Type: {selectedTransaction.account_type}</div>
    <div>Entry Method: {selectedTransaction.card_entry_method}</div>
<h3 className="font-semibold mt-4 mb-2">Authorization</h3>
    <div className="mt-3">
      Authorization Code: {selectedTransaction.authorization_code}
    </div>
    <div>Authorization Source: {selectedTransaction.authorization_source || '—'}</div>
    <div>Reference Number: {selectedTransaction.reference_number}</div>
    <div>Batch ID: {selectedTransaction.batch_id}</div>
    <div>Trace No: {selectedTransaction.trace_no}</div>
<h3 className="font-semibold mt-4 mb-2">Program</h3>
    <div className="mt-3">
      Payment Program: {selectedTransaction.payment_program}
    </div>

    <div>
      Host Message: {selectedTransaction.host_message}
    </div>
    <h3 className="font-semibold mt-4 mb-2">
  Amount Breakdown
</h3>

<div>
  Base Amount: {formatMoney(selectedTransaction.base_amount)}
</div>

<div>
  Tip Amount: {formatMoney(selectedTransaction.tip_amount)}
</div>

<div>
  Fee Amount: {formatMoney(selectedTransaction.fee_amount)}
</div>

<div>
  Cashback Amount: {formatMoney(selectedTransaction.cashback_amount)}
</div>

<div>
  Processed Amount: {formatMoney(selectedTransaction.processed_amount)}
</div>
  </div>
)}
      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-left">
<thead className="bg-gray-100">
  <tr>
    <th className="p-3">Time</th>
    <th className="p-3">Merchant</th>
    <th className="p-3">Device</th>
    <th className="p-3">Amount</th>
    <th className="p-3">Status</th>
    <th className="p-3">Card</th>
    <th className="p-3">Last 4</th>
    <th className="p-3">Entry</th>
    <th className="p-3">Details</th>
  </tr>
</thead>

          <tbody>
{loading ? (
  <tr>
    <td colSpan={9} className="p-8 text-center text-gray-500">
      Loading transactions...
    </td>
  </tr>
) : filteredTransactions.length === 0 ? (
  <tr>
    <td
      colSpan={9}
      className="p-8 text-center text-gray-500"
    >
      No transactions found
    </td>
  </tr>
) : (
  filteredTransactions.map((t) => (
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
                  {formatMoney(t.amount)}
                </td>

                <td className="p-3">
                  <span
                    className={`px-2 py-1 rounded text-sm ${
                      t.status === 'approved'
                        ? 'bg-green-100 text-green-700'
                        : t.status === 'declined'
                          ? 'bg-red-100 text-red-700'
                          : 'bg-gray-100 text-gray-700'
                    }`}
                  >
                    {t.status}
                  </span>
                </td>
<td className="p-3">
  {t.card_issuer || '—'}
</td>

<td className="p-3">
  {t.last4 || '—'}
</td>
                <td className="p-3 text-sm text-gray-600">
                  {t.card_entry_method || t.payment_method || '—'}
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
))
)}
          </tbody>
        </table>
      </div>
    </div>
  );
}
