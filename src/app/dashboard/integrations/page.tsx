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

type PledgerIntegrationStatus = {
  configured: boolean;
  token_hint: string;
  tax_id_hint: string;
  charity_name: string | null;
  status: string;
  last_verified_at: string | null;
  last_verification_error: string | null;
  updated_at: string;
};

type PledgerMerchantOption = {
  id: string;
  name: string;
  status: string;
  integration: PledgerIntegrationStatus | null;
};

type MatbiaIntegrationStatus = {
  configured: boolean;
  token_hint: string;
  organization_key_hint: string;
  status: string;
  last_verified_at: string | null;
  last_verification_error: string | null;
  updated_at: string;
};

type MatbiaMerchantOption = {
  id: string;
  name: string;
  status: string;
  integration: MatbiaIntegrationStatus | null;
};

export default function MerchantIntegrationsPage() {
  const [role, setRole] = useState('merchant');
  const [canManage, setCanManage] = useState(false);
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
      setCanManage(Boolean(payload.can_manage));
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

          {canManage ? <div className="mt-6 grid gap-4">
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
          </div> : null}

          {canManage ? <div className="mt-6 flex flex-wrap gap-3">
            <button type="button" onClick={() => void save()} disabled={!canSave || saving || disconnecting} className="rounded-lg bg-blue-700 px-5 py-2 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">
              {saving ? 'Saving securely...' : integration?.configured ? 'Replace The OJC Fund credentials' : 'Save The OJC Fund credentials'}
            </button>
            {integration?.configured && (
              <button type="button" onClick={() => void disconnect()} disabled={saving || disconnecting} className="rounded-lg border border-red-300 px-5 py-2 font-semibold text-red-700 disabled:opacity-50">
                {disconnecting ? 'Disconnecting...' : 'Disconnect The OJC Fund'}
              </button>
            )}
          </div> : null}

          <div className="mt-6 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-950">
            These credentials stay on Gimml&apos;s protected server. They are never sent to the Datecs device, displayed again, or included in transaction reports.
          </div>
        </section>
      )}

      <PledgerIntegrationCard />
      <MatbiaIntegrationCard />
    </main>
  );
}

function PledgerIntegrationCard() {
  const [role, setRole] = useState('merchant');
  const [canManage, setCanManage] = useState(false);
  const [merchants, setMerchants] = useState<PledgerMerchantOption[]>([]);
  const [merchantId, setMerchantId] = useState('');
  const [apiToken, setApiToken] = useState('');
  const [taxId, setTaxId] = useState('');
  const [charityName, setCharityName] = useState('');
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
      const response = await authenticatedFetch('/api/dashboard/integrations/pledger');
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Pledger setup could not be loaded.');
      const options = (payload.merchants ?? []) as PledgerMerchantOption[];
      setRole(payload.role || 'merchant');
      setCanManage(Boolean(payload.can_manage));
      setMerchants(options);
      setMerchantId((current) => options.some((merchant) => merchant.id === current)
        ? current
        : options[0]?.id || '');
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Pledger setup could not be loaded.');
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
  const canSave = Boolean(
    merchantId
    && apiToken.trim()
    && /^\d{9}$/.test(taxId)
    && charityName.trim()
  );

  function clearForm() {
    setApiToken('');
    setTaxId('');
    setCharityName('');
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
      const response = await authenticatedFetch('/api/dashboard/integrations/pledger', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          merchant_id: merchantId,
          api_token: apiToken,
          tax_id: taxId,
          charity_name: charityName
        })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Pledger credentials could not be saved.');
      setMerchants((current) => current.map((merchant) => merchant.id === merchantId
        ? { ...merchant, integration: payload.integration }
        : merchant));
      clearForm();
      setNotice('Pledger credentials were saved securely. The API token will not be displayed again.');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Pledger credentials could not be saved.');
    } finally {
      setSaving(false);
    }
  }

  async function disconnect() {
    if (!merchantId || !window.confirm('Disconnect Pledger and permanently remove the saved credentials?')) return;
    setDisconnecting(true);
    setError('');
    setNotice('');
    try {
      const response = await authenticatedFetch('/api/dashboard/integrations/pledger', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ merchant_id: merchantId })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Pledger could not be disconnected.');
      setMerchants((current) => current.map((merchant) => merchant.id === merchantId
        ? { ...merchant, integration: null }
        : merchant));
      clearForm();
      setNotice('Pledger was disconnected and the saved credentials were removed.');
    } catch (disconnectError) {
      setError(disconnectError instanceof Error ? disconnectError.message : 'Pledger could not be disconnected.');
    } finally {
      setDisconnecting(false);
    }
  }

  if (loading) {
    return <section className="mt-8 rounded-2xl border bg-white p-6 shadow-sm">Loading Pledger setup...</section>;
  }
  if (!merchants.length && !error) return null;

  return (
    <section className="mt-8 rounded-2xl border bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold">Pledger</h2>
          <p className="mt-1 text-sm text-gray-600">Connect the charity account used for Pledger card donations.</p>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-bold uppercase ${integration?.configured ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-900'}`}>
          {integration?.configured ? integration.status : 'Not configured'}
        </span>
      </div>

      {error && <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-red-800" role="alert">{error}</div>}
      {notice && <div className="mt-6 rounded-xl border border-green-200 bg-green-50 p-4 text-green-800">{notice}</div>}

      {(role === 'admin' || role === 'super_admin') && merchants.length > 0 && (
        <label className="mt-6 block text-sm font-medium">
          Merchant
          <select value={merchantId} onChange={(event) => selectMerchant(event.target.value)} className="mt-1 w-full rounded-lg border px-3 py-2 font-normal">
            {merchants.map((merchant) => <option key={merchant.id} value={merchant.id}>{merchant.name}</option>)}
          </select>
        </label>
      )}

      {integration?.configured && (
        <div className="mt-6 rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-950">
          <div className="font-semibold">Saved Pledger connection</div>
          <div className="mt-2 grid gap-1 sm:grid-cols-2">
            <div>API token: {integration.token_hint || 'saved'}</div>
            <div>{integration.tax_id_hint || 'Tax ID saved'}</div>
            <div className="sm:col-span-2">Charity: {integration.charity_name || 'saved'}</div>
          </div>
          <p className="mt-2 text-xs">Enter all three fields below to replace the saved credentials.</p>
        </div>
      )}

      {canManage ? <div className="mt-6 grid gap-4">
        <label className="text-sm font-medium">
          Pledger Bearer API token
          <input
            type="password"
            value={apiToken}
            onChange={(event) => setApiToken(event.target.value)}
            autoComplete="off"
            maxLength={2048}
            placeholder={integration?.configured ? 'Enter API token again to update' : 'Bearer API token'}
            className="mt-1 w-full rounded-lg border px-3 py-2 font-normal"
          />
        </label>
        <label className="text-sm font-medium">
          Charity tax ID
          <input
            value={taxId}
            onChange={(event) => setTaxId(event.target.value.replace(/\D/g, '').slice(0, 9))}
            inputMode="numeric"
            autoComplete="off"
            maxLength={9}
            placeholder="9 digits"
            className="mt-1 w-full rounded-lg border px-3 py-2 font-normal"
          />
        </label>
        <label className="text-sm font-medium">
          Charity name registered with Pledger
          <input
            value={charityName}
            onChange={(event) => setCharityName(event.target.value)}
            autoComplete="organization"
            maxLength={254}
            placeholder="Charity name"
            className="mt-1 w-full rounded-lg border px-3 py-2 font-normal"
          />
        </label>
      </div> : null}

      {canManage ? <div className="mt-6 flex flex-wrap gap-3">
        <button type="button" onClick={() => void save()} disabled={!canSave || saving || disconnecting} className="rounded-lg bg-blue-700 px-5 py-2 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">
          {saving ? 'Saving securely...' : integration?.configured ? 'Replace Pledger credentials' : 'Save Pledger credentials'}
        </button>
        {integration?.configured && (
          <button type="button" onClick={() => void disconnect()} disabled={saving || disconnecting} className="rounded-lg border border-red-300 px-5 py-2 font-semibold text-red-700 disabled:opacity-50">
            {disconnecting ? 'Disconnecting...' : 'Disconnect Pledger'}
          </button>
        )}
      </div> : null}

      <div className="mt-6 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-950">
        The API token and tax ID stay on Gimml&apos;s protected server. They are never sent to the Datecs device or displayed again.
      </div>
    </section>
  );
}

function MatbiaIntegrationCard() {
  const [role, setRole] = useState('merchant');
  const [canManage, setCanManage] = useState(false);
  const [merchants, setMerchants] = useState<MatbiaMerchantOption[]>([]);
  const [merchantId, setMerchantId] = useState('');
  const [authorizationToken, setAuthorizationToken] = useState('');
  const [organizationKey, setOrganizationKey] = useState('');
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
      const response = await authenticatedFetch('/api/dashboard/integrations/matbia');
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Matbia setup could not be loaded.');
      const options = (payload.merchants ?? []) as MatbiaMerchantOption[];
      setRole(payload.role || 'merchant');
      setCanManage(Boolean(payload.can_manage));
      setMerchants(options);
      setMerchantId((current) => options.some((merchant) => merchant.id === current)
        ? current
        : options[0]?.id || '');
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Matbia setup could not be loaded.');
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
  const canSave = Boolean(
    merchantId
    && authorizationToken.trim()
    && organizationKey.trim()
  );

  function clearForm() {
    setAuthorizationToken('');
    setOrganizationKey('');
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
      const response = await authenticatedFetch('/api/dashboard/integrations/matbia', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          merchant_id: merchantId,
          authorization_token: authorizationToken,
          org_user_handle: organizationKey
        })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Matbia credentials could not be saved.');
      setMerchants((current) => current.map((merchant) => merchant.id === merchantId
        ? { ...merchant, integration: payload.integration }
        : merchant));
      clearForm();
      setNotice('Matbia credentials were saved securely. They will not be displayed again.');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Matbia credentials could not be saved.');
    } finally {
      setSaving(false);
    }
  }

  async function disconnect() {
    if (!merchantId || !window.confirm('Disconnect Matbia and permanently remove the saved credentials?')) return;
    setDisconnecting(true);
    setError('');
    setNotice('');
    try {
      const response = await authenticatedFetch('/api/dashboard/integrations/matbia', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ merchant_id: merchantId })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Matbia could not be disconnected.');
      setMerchants((current) => current.map((merchant) => merchant.id === merchantId
        ? { ...merchant, integration: null }
        : merchant));
      clearForm();
      setNotice('Matbia was disconnected and the saved credentials were removed.');
    } catch (disconnectError) {
      setError(disconnectError instanceof Error ? disconnectError.message : 'Matbia could not be disconnected.');
    } finally {
      setDisconnecting(false);
    }
  }

  if (loading) {
    return <section className="mt-8 rounded-2xl border bg-white p-6 shadow-sm">Loading Matbia setup...</section>;
  }
  if (!merchants.length && !error) return null;

  return (
    <section className="mt-8 rounded-2xl border bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold">Matbia</h2>
          <p className="mt-1 text-sm text-gray-600">Connect the organization account used for Matbia card donations.</p>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-bold uppercase ${integration?.configured ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-900'}`}>
          {integration?.configured ? integration.status : 'Not configured'}
        </span>
      </div>

      {error && <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-red-800" role="alert">{error}</div>}
      {notice && <div className="mt-6 rounded-xl border border-green-200 bg-green-50 p-4 text-green-800">{notice}</div>}

      {(role === 'admin' || role === 'super_admin') && merchants.length > 0 && (
        <label className="mt-6 block text-sm font-medium">
          Merchant
          <select value={merchantId} onChange={(event) => selectMerchant(event.target.value)} className="mt-1 w-full rounded-lg border px-3 py-2 font-normal">
            {merchants.map((merchant) => <option key={merchant.id} value={merchant.id}>{merchant.name}</option>)}
          </select>
        </label>
      )}

      {integration?.configured && (
        <div className="mt-6 rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-950">
          <div className="font-semibold">Saved Matbia connection</div>
          <div className="mt-2 grid gap-1 sm:grid-cols-2">
            <div>Authorization: {integration.token_hint || 'saved'}</div>
            <div>{integration.organization_key_hint || 'Organization API key saved'}</div>
          </div>
          <p className="mt-2 text-xs">Enter both fields below to replace the saved credentials.</p>
        </div>
      )}

      {canManage ? <div className="mt-6 grid gap-4">
        <label className="text-sm font-medium">
          Matbia authorization token
          <input
            type="password"
            value={authorizationToken}
            onChange={(event) => setAuthorizationToken(event.target.value)}
            autoComplete="off"
            maxLength={2048}
            placeholder={integration?.configured ? 'Enter authorization token again to update' : 'Authorization token'}
            className="mt-1 w-full rounded-lg border px-3 py-2 font-normal"
          />
        </label>
        <label className="text-sm font-medium">
          Matbia organization API key
          <input
            type="password"
            value={organizationKey}
            onChange={(event) => setOrganizationKey(event.target.value)}
            autoComplete="off"
            maxLength={500}
            placeholder={integration?.configured ? 'Enter organization API key again to update' : 'orgUserHandle from the Matbia profile'}
            className="mt-1 w-full rounded-lg border px-3 py-2 font-normal"
          />
          <span className="mt-1 block text-xs font-normal text-gray-500">Matbia calls this the orgUserHandle and recommends it as the most accurate organization match.</span>
        </label>
      </div> : null}

      {canManage ? <div className="mt-6 flex flex-wrap gap-3">
        <button type="button" onClick={() => void save()} disabled={!canSave || saving || disconnecting} className="rounded-lg bg-blue-700 px-5 py-2 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">
          {saving ? 'Saving securely...' : integration?.configured ? 'Replace Matbia credentials' : 'Save Matbia credentials'}
        </button>
        {integration?.configured && (
          <button type="button" onClick={() => void disconnect()} disabled={saving || disconnecting} className="rounded-lg border border-red-300 px-5 py-2 font-semibold text-red-700 disabled:opacity-50">
            {disconnecting ? 'Disconnecting...' : 'Disconnect Matbia'}
          </button>
        )}
      </div> : null}

      <div className="mt-6 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-950">
        Both values stay on Gimml&apos;s protected server. They are never sent to the Datecs device or displayed again.
      </div>
    </section>
  );
}
