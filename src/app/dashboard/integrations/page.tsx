'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../../lib/supabase';

type IntegrationStatus = {
  configured: boolean;
  username_hint: string;
  organization_hint: string;
  organization_name: string | null;
  status: string;
  last_verified_at: string | null;
  last_verification_error: string | null;
  updated_at: string;
};

type MerchantOption = {
  id: string;
  name: string;
  status: string;
  integration: IntegrationStatus | null;
};

export default function MerchantIntegrationsPage() {
  const [role, setRole] = useState('merchant');
  const [merchants, setMerchants] = useState<MerchantOption[]>([]);
  const [merchantId, setMerchantId] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [organizationId, setOrganizationId] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const authenticatedFetch = useCallback(async (url: string, options: RequestInit = {}) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error('Please sign in again.');
    return fetch(url, {
      ...options,
      headers: {
        ...options.headers,
        Authorization: `Bearer ${session.access_token}`
      },
      cache: 'no-store'
    });
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await authenticatedFetch('/api/dashboard/integrations/ojc');
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Integration setup could not be loaded.');
      const options = (payload.merchants ?? []) as MerchantOption[];
      setRole(payload.role || 'merchant');
      setMerchants(options);
      setMerchantId((current) => options.some((merchant) => merchant.id === current)
        ? current
        : options[0]?.id || '');
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Integration setup could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [authenticatedFetch]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const selectedMerchant = useMemo(
    () => merchants.find((merchant) => merchant.id === merchantId) ?? null,
    [merchantId, merchants]
  );
  const integration = selectedMerchant?.integration;
  const canSave = Boolean(merchantId && username.trim() && password && organizationId.trim());

  function clearForm() {
    setUsername('');
    setPassword('');
    setOrganizationId('');
  }

  function selectMerchant(value: string) {
    setMerchantId(value);
    setError('');
    setNotice('');
    clearForm();
  }

  async function save() {
    if (!canSave) return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const response = await authenticatedFetch('/api/dashboard/integrations/ojc', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          merchant_id: merchantId,
          username,
          password,
          organization_id: organizationId
        })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'The OJC Fund credentials could not be saved.');
      setMerchants((current) => current.map((merchant) => merchant.id === merchantId
        ? { ...merchant, integration: payload.integration }
        : merchant));
      clearForm();
      setNotice('The OJC Fund credentials were saved securely. The password will not be displayed again.');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'The OJC Fund credentials could not be saved.');
    } finally {
      setSaving(false);
    }
  }

  async function disconnect() {
    if (!merchantId || !window.confirm('Disconnect The OJC Fund and permanently remove the saved credentials?')) return;
    setDisconnecting(true);
    setError('');
    setNotice('');
    try {
      const response = await authenticatedFetch('/api/dashboard/integrations/ojc', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ merchant_id: merchantId })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'The OJC Fund could not be disconnected.');
      setMerchants((current) => current.map((merchant) => merchant.id === merchantId
        ? { ...merchant, integration: null }
        : merchant));
      clearForm();
      setNotice('The OJC Fund was disconnected and the saved credentials were removed.');
    } catch (disconnectError) {
      setError(disconnectError instanceof Error ? disconnectError.message : 'The OJC Fund could not be disconnected.');
    } finally {
      setDisconnecting(false);
    }
  }

  if (loading) return <main className="mx-auto max-w-4xl p-10">Loading integrations...</main>;

  return (
    <main className="mx-auto max-w-4xl p-6 sm:p-10">
      <h1 className="text-3xl font-bold">Closed-loop card connections</h1>
      <p className="mt-2 text-gray-600">
        Connect the accounts Gimml will use to authorize each merchant&apos;s closed-loop cards.
      </p>

      {error && <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-red-800" role="alert">{error}</div>}
      {notice && <div className="mt-6 rounded-xl border border-green-200 bg-green-50 p-4 text-green-800">{notice}</div>}

      {!merchants.length ? (
        <div className="mt-8 rounded-xl border border-dashed bg-white p-8 text-center text-gray-500">
          No merchant account is available for integration setup.
        </div>
      ) : (
        <section className="mt-8 rounded-2xl border bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold">The OJC Fund</h2>
              <p className="mt-1 text-sm text-gray-600">Credentials are encrypted before they are stored.</p>
            </div>
            <span className={`rounded-full px-3 py-1 text-xs font-bold uppercase ${integration?.configured ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-900'}`}>
              {integration?.configured ? integration.status : 'Not configured'}
            </span>
          </div>

          {(role === 'admin' || role === 'super_admin') && (
            <label className="mt-6 block text-sm font-medium">
              Merchant
              <select value={merchantId} onChange={(event) => selectMerchant(event.target.value)} className="mt-1 w-full rounded-lg border px-3 py-2 font-normal">
                {merchants.map((merchant) => <option key={merchant.id} value={merchant.id}>{merchant.name}</option>)}
              </select>
            </label>
          )}

          {integration?.configured && (
            <div className="mt-6 rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-950">
              <div className="font-semibold">Saved connection for The OJC Fund</div>
              <div className="mt-2 grid gap-1 sm:grid-cols-2">
                <div>Username: {integration.username_hint || 'saved'}</div>
                <div>Organization credential: {integration.organization_hint || 'saved'}</div>
              </div>
              <p className="mt-2 text-xs">Enter all three fields below to replace the saved credentials.</p>
            </div>
          )}

          <div className="mt-6 grid gap-4">
            <label className="text-sm font-medium">
              The OJC Fund username
              <input
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                autoComplete="username"
                maxLength={254}
                placeholder={integration?.configured ? 'Enter username again to update' : 'The OJC Fund username'}
                className="mt-1 w-full rounded-lg border px-3 py-2 font-normal"
              />
            </label>
            <label className="text-sm font-medium">
              The OJC Fund password
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
                maxLength={512}
                placeholder={integration?.configured ? 'Enter password again to update' : 'The OJC Fund password'}
                className="mt-1 w-full rounded-lg border px-3 py-2 font-normal"
              />
            </label>
            <label className="text-sm font-medium">
              The OJC Fund organization ID / API key
              <input
                type="password"
                value={organizationId}
                onChange={(event) => setOrganizationId(event.target.value)}
                autoComplete="off"
                maxLength={500}
                placeholder="Value supplied by The OJC Fund"
                className="mt-1 w-full rounded-lg border px-3 py-2 font-normal"
              />
              <span className="mt-1 block text-xs font-normal text-gray-500">This is the organization value The OJC Fund requires when processing and voiding transactions.</span>
            </label>
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <button type="button" onClick={() => void save()} disabled={!canSave || saving || disconnecting} className="rounded-lg bg-blue-700 px-5 py-2 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">
              {saving ? 'Saving securely...' : integration?.configured ? 'Replace The OJC Fund credentials' : 'Save The OJC Fund credentials'}
            </button>
            {integration?.configured && (
              <button type="button" onClick={() => void disconnect()} disabled={saving || disconnecting} className="rounded-lg border border-red-300 px-5 py-2 font-semibold text-red-700 disabled:opacity-50">
                {disconnecting ? 'Disconnecting...' : 'Disconnect The OJC Fund'}
              </button>
            )}
          </div>

          <div className="mt-6 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-950">
            These credentials stay on Gimml&apos;s protected server. They are never sent to the Datecs device, displayed again, or included in transaction reports.
          </div>
        </section>
      )}
    </main>
  );
}
