'use client';

import { useCallback, useEffect, useState } from 'react';
import MerchantDeleteConfirmation from '../../../components/merchant-delete-confirmation';
import MerchantForm from '../../../components/merchant-form';
import MerchantList from '../../../components/merchant-list';
import type { MerchantFormValues, MerchantRecord, SalesRepresentative } from '../../../lib/merchant-management';
import { supabase } from '../../../lib/supabase';

export default function MerchantsPage() {
  const [merchants, setMerchants] = useState<MerchantRecord[]>([]);
  const [representatives, setRepresentatives] = useState<SalesRepresentative[]>([]);
  const [owner, setOwner] = useState(false);
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<MerchantRecord | null>(null);

  const request = useCallback(async (method = 'GET', body?: object) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error('Please sign in again.');
    const response = await fetch('/api/admin/merchants', { method, headers: { Authorization: `Bearer ${session.access_token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined, cache: 'no-store' });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || 'Merchant request failed.');
    if (payload.merchants) setMerchants(payload.merchants);
    if (payload.salesRepresentatives) setRepresentatives(payload.salesRepresentatives);
    if (typeof payload.owner === 'boolean') setOwner(payload.owner);
    return payload;
  }, []);

  useEffect(() => { const timer = window.setTimeout(() => { void request().catch(cause => setError(cause.message)); }, 0); return () => window.clearTimeout(timer); }, [request]);
  async function create(values: MerchantFormValues) { setBusy(true); setError(''); setMessage(''); try { await request('POST', values); setMessage('Merchant created in the dashboard and combined terminal platform.'); return true; } catch (cause) { setError(cause instanceof Error ? cause.message : 'Merchant could not be created.'); return false; } finally { setBusy(false); } }
  async function archive(merchant: MerchantRecord) { if (!window.confirm(`Archive ${merchant.name}? Its devices and integrations will be disabled, while financial history is retained.`)) return; setBusy(true); setError(''); try { await request('PATCH', { merchantId: merchant.id }); setMessage(`${merchant.name} was archived.`); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Merchant could not be archived.'); } finally { setBusy(false); } }
  async function remove(confirmName: string) { if (!deleteTarget) return; setBusy(true); setError(''); try { await request('DELETE', { merchantId: deleteTarget.id, confirmName }); setMessage(`${deleteTarget.name} and its test data were permanently deleted.`); setDeleteTarget(null); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Merchant could not be deleted.'); } finally { setBusy(false); } }
  const normalized = search.trim().toLowerCase();
  const visible = merchants.filter(merchant => !normalized || [merchant.name, merchant.legal_business_name, merchant.dba_name, merchant.primary_contact_email].some(value => value?.toLowerCase().includes(normalized)));

  return <main className="mx-auto max-w-6xl p-10"><h1 className="text-3xl font-bold">Merchants</h1><p className="mt-2 text-gray-600">Create and manage merchant accounts separately from Overview.</p>{error && <div className="mt-5 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700" role="alert">{error}</div>}{message && <div className="mt-5 rounded border border-green-200 bg-green-50 p-3 text-sm text-green-800" role="status">{message}</div>}<MerchantForm salesRepresentatives={representatives} saving={busy} onSubmit={create} /><label className="mt-8 block text-sm font-medium">Search merchants<input value={search} onChange={event => setSearch(event.target.value)} placeholder="Name, legal name, DBA, or email" className="mt-1 w-full rounded border px-3 py-2" /></label><MerchantList merchants={visible} representatives={representatives} owner={owner} onArchive={archive} onDelete={setDeleteTarget} />{deleteTarget && <MerchantDeleteConfirmation merchant={deleteTarget} busy={busy} onCancel={() => setDeleteTarget(null)} onDelete={remove} />}</main>;
}
