'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';

type Status = { configured: boolean; token_hint: string; charity_hint: string; account_hint: string | null; status: string };
type Merchant = { id: string; name: string; integration: Status | null };

export function DonorsFundCard() {
  const [role, setRole] = useState('merchant');
  const [canManage, setCanManage] = useState(false);
  const [merchants, setMerchants] = useState<Merchant[]>([]);
  const [merchantId, setMerchantId] = useState('');
  const [token, setToken] = useState('');
  const [taxId, setTaxId] = useState('');
  const [account, setAccount] = useState('');
  const [busy, setBusy] = useState(true);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const request = useCallback(async (options: RequestInit = {}) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error('Please sign in again.');
    return fetch('/api/dashboard/integrations/donors-fund', {
      ...options,
      cache: 'no-store',
      headers: { ...options.headers, Authorization: `Bearer ${session.access_token}` }
    });
  }, []);

  const load = useCallback(async () => {
    try {
      const response = await request();
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'The Donors Fund setup could not be loaded.');
      setRole(payload.role || 'merchant');
      setCanManage(Boolean(payload.can_manage));
      setMerchants(payload.merchants || []);
      setMerchantId((current) => payload.merchants?.some((item: Merchant) => item.id === current) ? current : payload.merchants?.[0]?.id || '');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The Donors Fund setup could not be loaded.');
    } finally {
      setBusy(false);
    }
  }, [request]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);
  const integration = merchants.find(item => item.id === merchantId)?.integration ?? null;
  const valid = Boolean(merchantId && token.trim() && /^\d{9}$/.test(taxId) && /^\d{7}$/.test(account));
  const clear = () => { setToken(''); setTaxId(''); setAccount(''); };

  async function save() {
    if (!valid) return;
    setBusy(true); setError(''); setMessage('');
    try {
      const response = await request({ method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ merchant_id: merchantId, validation_token: token, tax_id: taxId, account_number: account }) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'The Donors Fund credentials could not be saved.');
      setMerchants(current => current.map(item => item.id === merchantId ? { ...item, integration: payload.integration } : item));
      clear(); setMessage('The Donors Fund connection was saved securely.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'The Donors Fund credentials could not be saved.'); }
    finally { setBusy(false); }
  }

  async function disconnect() {
    if (!window.confirm('Disconnect The Donors Fund and permanently remove its saved merchant credentials?')) return;
    setBusy(true); setError(''); setMessage('');
    try {
      const response = await request({ method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ merchant_id: merchantId }) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'The Donors Fund could not be disconnected.');
      setMerchants(current => current.map(item => item.id === merchantId ? { ...item, integration: null } : item));
      clear(); setMessage('The Donors Fund was disconnected.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'The Donors Fund could not be disconnected.'); }
    finally { setBusy(false); }
  }

  if (busy && !merchants.length) return <section className="mt-8 rounded-2xl border bg-white p-6">Loading The Donors Fund setup...</section>;
  if (!merchants.length && !error) return null;
  return <section className="mt-8 rounded-2xl border bg-white p-6 shadow-sm">
    <div className="flex justify-between gap-4"><div><h2 className="text-xl font-semibold">The Donors Fund</h2><p className="mt-1 text-sm text-gray-600">Merchant charity connection. Transaction routing remains disabled until Datecs returns the required card data.</p></div><span className={`h-fit rounded-full px-3 py-1 text-xs font-bold uppercase ${integration?.configured ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-900'}`}>{integration?.configured ? integration.status : 'Not configured'}</span></div>
    {error && <div role="alert" className="mt-5 rounded border border-red-200 bg-red-50 p-3 text-red-800">{error}</div>}
    {message && <div className="mt-5 rounded border border-green-200 bg-green-50 p-3 text-green-800">{message}</div>}
    {(role === 'admin' || role === 'super_admin') && <label className="mt-5 block text-sm font-medium">Merchant<select className="mt-1 w-full rounded border p-2" value={merchantId} onChange={event => { setMerchantId(event.target.value); clear(); }}><option value="" disabled>Select a merchant</option>{merchants.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}
    {integration?.configured && <div className="mt-5 rounded border border-green-200 bg-green-50 p-4 text-sm"><div className="font-semibold">Saved connection</div><div className="mt-2">{integration.token_hint} · {integration.charity_hint} · {integration.account_hint}</div></div>}
    {canManage && <div className="mt-5 grid gap-4 sm:grid-cols-2">
      <label className="text-sm font-medium sm:col-span-2">Validation token<input type="password" autoComplete="off" maxLength={2048} className="mt-1 w-full rounded border p-2" value={token} onChange={event => setToken(event.target.value)} /></label>
      <label className="text-sm font-medium">Charity tax ID<input inputMode="numeric" maxLength={9} placeholder="9 digits" className="mt-1 w-full rounded border p-2" value={taxId} onChange={event => setTaxId(event.target.value.replace(/\D/g, '').slice(0, 9))} /></label>
      <label className="text-sm font-medium">Charity account number<input inputMode="numeric" maxLength={7} placeholder="7 digits" className="mt-1 w-full rounded border p-2" value={account} onChange={event => setAccount(event.target.value.replace(/\D/g, '').slice(0, 7))} /></label>
      <div className="flex gap-3 sm:col-span-2"><button type="button" disabled={!valid || busy} onClick={() => void save()} className="rounded bg-blue-700 px-5 py-2 font-semibold text-white disabled:opacity-50">{integration?.configured ? 'Replace connection' : 'Save connection'}</button>{integration?.configured && <button type="button" disabled={busy} onClick={() => void disconnect()} className="rounded border border-red-300 px-5 py-2 font-semibold text-red-700">Disconnect</button>}</div>
    </div>}
    <div className="mt-5 rounded border border-blue-200 bg-blue-50 p-4 text-sm text-blue-950">The validation token is encrypted in Supabase Vault. None of these values are sent to the terminal or displayed again.</div>
  </section>;
}
