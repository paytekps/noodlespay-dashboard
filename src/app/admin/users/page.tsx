'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabase';

type Role = 'super_admin' | 'admin' | 'sales_rep' | 'merchant';
type UserRow = { id: string; email: string | null; full_name: string | null; role: Role; merchant_id: string | null; assigned_merchant_ids: string[] };
type Merchant = { id: string; name: string };

export default function UsersAndAccessPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [merchants, setMerchants] = useState<Merchant[]>([]);
  const [currentUserId, setCurrentUserId] = useState('');
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [newRole, setNewRole] = useState<Role>('merchant');
  const [newMerchantId, setNewMerchantId] = useState('');
  const [newMerchantIds, setNewMerchantIds] = useState<string[]>([]);

  const callApi = useCallback(async (method = 'GET', body?: object) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('Please sign in again.');

    const response = await fetch('/api/admin/users', {
      method,
      headers: { Authorization: `Bearer ${session.access_token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'The request failed.');
    setUsers(result.users || []);
    setMerchants(result.merchants || []);
    setCurrentUserId(result.currentUserId || '');
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      callApi().catch((reason) => setError(reason.message)).finally(() => setLoading(false));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [callApi]);

  function updateLocal(userId: string, changes: Partial<UserRow>) {
    setUsers((current) => current.map((user) => user.id === userId ? { ...user, ...changes } : user));
    setNotice('');
    setError('');
  }

  async function inviteUser() {
    setBusyId('invite'); setError(''); setNotice('');
    try {
      await callApi('POST', {
        email,
        fullName,
        role: newRole,
        merchantId: newRole === 'merchant' ? newMerchantId : null,
        merchantIds: newRole === 'sales_rep' ? newMerchantIds : []
      });
      setEmail(''); setFullName('');
      setNewMerchantId(''); setNewMerchantIds([]);
      setNotice('Invitation sent. The user must use the email link to finish setting up the account.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Invitation failed.');
    } finally { setBusyId(''); }
  }

  async function saveUser(user: UserRow) {
    setBusyId(user.id); setError(''); setNotice('');
    try {
      await callApi('PATCH', {
        userId: user.id,
        role: user.role,
        merchantId: user.role === 'merchant' ? user.merchant_id : null,
        merchantIds: user.role === 'sales_rep' ? user.assigned_merchant_ids : []
      });
      setNotice(`Access updated for ${user.email || 'the selected user'}.`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Update failed.');
      await callApi().catch(() => undefined);
    } finally { setBusyId(''); }
  }

  if (loading) return <div className="p-10">Loading users...</div>;

  return (
    <main className="mx-auto max-w-5xl p-10">
      <div className="mb-8"><h1 className="text-3xl font-bold">Users &amp; Access</h1><p className="mt-2 text-gray-600">Owner-only controls for inviting users and assigning their access.</p></div>
      {error && <div className="mb-5 rounded border border-red-200 bg-red-50 p-3 text-red-700" role="alert">{error}</div>}
      {notice && <div className="mb-5 rounded border border-green-200 bg-green-50 p-3 text-green-700">{notice}</div>}

      <section className="mb-10 rounded-xl border bg-white p-6 shadow-sm">
        <h2 className="text-xl font-semibold">Invite a user</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <label className="text-sm">Full name<input value={fullName} onChange={(event) => setFullName(event.target.value)} className="mt-1 w-full rounded border px-3 py-2" /></label>
          <label className="text-sm">Email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} className="mt-1 w-full rounded border px-3 py-2" /></label>
          <label className="text-sm">User type<select value={newRole} onChange={(event) => setNewRole(event.target.value as Role)} className="mt-1 w-full rounded border px-3 py-2"><option value="merchant">Merchant</option><option value="sales_rep">Sales representative</option><option value="admin">Administrator</option></select></label>
          {newRole === 'merchant' && <label className="text-sm">Merchant<select value={newMerchantId} onChange={(event) => setNewMerchantId(event.target.value)} className="mt-1 w-full rounded border px-3 py-2"><option value="">Select merchant</option>{merchants.map((merchant) => <option key={merchant.id} value={merchant.id}>{merchant.name}</option>)}</select></label>}
          {newRole === 'sales_rep' && <fieldset className="rounded border p-3 text-sm"><legend className="px-1">Assigned merchants</legend><div className="grid gap-2">{merchants.map((merchant) => <label key={merchant.id} className="flex items-center gap-2"><input type="checkbox" checked={newMerchantIds.includes(merchant.id)} onChange={(event) => setNewMerchantIds((current) => event.target.checked ? [...current, merchant.id] : current.filter((id) => id !== merchant.id))} />{merchant.name}</label>)}</div></fieldset>}
        </div>
        <button onClick={inviteUser} disabled={busyId === 'invite'} className="mt-4 rounded bg-black px-5 py-2 text-white disabled:opacity-50">{busyId === 'invite' ? 'Sending...' : 'Send invitation'}</button>
      </section>

      <section><h2 className="mb-4 text-xl font-semibold">Current users</h2><div className="space-y-4">
        {users.map((user) => {
          const isCurrentOwner = user.id === currentUserId;
          return <div key={user.id} className="rounded-xl border bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-start justify-between gap-4"><div><div className="font-semibold">{user.full_name || user.email || 'Unnamed user'}</div><div className="text-sm text-gray-500">{user.email}</div></div>{isCurrentOwner && <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">Your Owner account</span>}</div>
            <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto] md:items-end">
              <label className="text-sm">User type<select disabled={isCurrentOwner} value={user.role} onChange={(event) => updateLocal(user.id, { role: event.target.value as Role, merchant_id: event.target.value === 'merchant' ? user.merchant_id : null })} className="mt-1 w-full rounded border px-3 py-2 disabled:bg-gray-100"><option value="super_admin">Owner</option><option value="admin">Administrator</option><option value="sales_rep">Sales representative</option><option value="merchant">Merchant</option></select></label>
              <label className="text-sm">Merchant<select disabled={isCurrentOwner || user.role !== 'merchant'} value={user.merchant_id || ''} onChange={(event) => updateLocal(user.id, { merchant_id: event.target.value || null })} className="mt-1 w-full rounded border px-3 py-2 disabled:bg-gray-100"><option value="">Not assigned</option>{merchants.map((merchant) => <option key={merchant.id} value={merchant.id}>{merchant.name}</option>)}</select></label>
              <button disabled={isCurrentOwner || busyId === user.id} onClick={() => saveUser(user)} className="rounded bg-blue-600 px-5 py-2 text-white disabled:opacity-40">{busyId === user.id ? 'Saving...' : 'Save access'}</button>
            </div>
            {user.role === 'sales_rep' && <fieldset className="mt-4 rounded border p-3 text-sm"><legend className="px-1 font-medium">Assigned merchants</legend><div className="grid gap-2 sm:grid-cols-2">{merchants.map((merchant) => <label key={merchant.id} className="flex items-center gap-2"><input type="checkbox" disabled={isCurrentOwner} checked={user.assigned_merchant_ids.includes(merchant.id)} onChange={(event) => updateLocal(user.id, { assigned_merchant_ids: event.target.checked ? [...user.assigned_merchant_ids, merchant.id] : user.assigned_merchant_ids.filter((id) => id !== merchant.id) })} />{merchant.name}</label>)}</div></fieldset>}
          </div>;
        })}
      </div></section>
    </main>
  );
}
